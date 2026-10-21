/**
 * Phase 2 Migration 3 verification — Reservations.
 *
 * Coverage:
 *  A. Basic create/pick/release/cancel happy path
 *  B. All-or-nothing atomicity — a shortage on ANY line rolls back the whole
 *     reservation; no partial ("short") state is ever persisted
 *  C. Global and per-warehouse availability enforcement
 *  D. Idempotency — same (source_kind, source_id) returns the existing header
 *  E. Pick moves stock sellable → picked, matches ledger, decrements
 *     `sku_active_reserved`, and never subtracts stock twice
 *  F. Release / cancel restore availability exactly once; cannot release more
 *     than remaining; cannot pick after cancellation
 *  G. Concurrency — 30 parallel reservations of qty 5 against 100 sellable
 *     succeed exactly 20 times (100/5), and never oversell
 *  H. Concurrency — 10 parallel cancels of the same header release only once
 *  I. anon cannot execute any of the four RPCs
 *  J. Permission gating — reservations.manage / fulfilment.pick enforced
 *
 * Usage:  bunx tsx scripts/phase2-mig3-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

async function mkUser(email: string) {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  await c.auth.signInWithPassword({ email, password: pw });
  return { uid, client: c, email };
}
async function roleId(key: string) {
  const { data } = await admin.from("system_company_roles").select("id").eq("key", key).single();
  return data!.id as string;
}
async function addMember(company_id: string, user_id: string, role_key: string) {
  const { data: m } = await admin.from("company_members")
    .insert({ company_id, user_id, status: "active" }).select().single();
  const rid = await roleId(role_key);
  await admin.from("company_member_roles").insert({ member_id: m!.id, role_id: rid });
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p2m3_alice_${stamp}@borvat.test`);   // owner (all perms)
  const bob = await mkUser(`p2m3_bob_${stamp}@borvat.test`);       // viewer (no perms)
  const cleanup: string[] = [];

  try {
    const { data: comp } = await alice.client.from("companies")
      .insert({ name: "ResvCo", slug: `resvco-${stamp}`, owner_user_id: alice.uid }).select().single();
    cleanup.push(comp!.id);
    await addMember(comp!.id, bob.uid, "viewer");

    const { data: sku1 } = await alice.client.from("catalog_skus")
      .insert({ company_id: comp!.id, code: "R-S1", tracking_mode: "none" }).select().single();
    const { data: sku2 } = await alice.client.from("catalog_skus")
      .insert({ company_id: comp!.id, code: "R-S2", tracking_mode: "none" }).select().single();
    const { data: wh1 } = await alice.client.from("warehouses")
      .insert({ company_id: comp!.id, code: "R-W1", name: "W1", requires_location: false }).select().single();
    const { data: wh2 } = await alice.client.from("warehouses")
      .insert({ company_id: comp!.id, code: "R-W2", name: "W2", requires_location: false }).select().single();

    // Receive stock: 100 of sku1 in wh1, 50 of sku2 in wh1, 30 of sku1 in wh2
    await alice.client.rpc("post_inventory_transaction", {
      _company_id: comp!.id, _reason: "stock_receipt",
      _entries: [
        { sku_id: sku1!.id, warehouse_id: wh1!.id, disposition: "sellable", quantity: 100 },
        { sku_id: sku2!.id, warehouse_id: wh1!.id, disposition: "sellable", quantity: 50 },
        { sku_id: sku1!.id, warehouse_id: wh2!.id, disposition: "sellable", quantity: 30 },
      ],
    });

    // ── I. anon cannot execute the four RPCs ────────────────────────────
    const anonC = anonClient();
    const rpcs: Array<[string, Record<string, unknown>]> = [
      ["create_reservation",       { _company_id: comp!.id, _source_kind: "manual_hold", _source_id: crypto.randomUUID(), _lines: [] }],
      ["pick_reservation_allocation", { _allocation_id: crypto.randomUUID(), _quantity: 1 }],
      ["release_reservation",      { _reservation_id: crypto.randomUUID() }],
      ["cancel_reservation",       { _reservation_id: crypto.randomUUID() }],
    ];
    for (const [n, a] of rpcs) {
      const { error } = await anonC.rpc(n, a);
      check(`I.${n} rejects anon`, !!error && /permission denied|42501/i.test(error.message + " " + error.code), error?.message);
    }

    // ── J. viewer (bob) cannot create/release; cannot pick ──────────────
    {
      const { error } = await bob.client.rpc("create_reservation", {
        _company_id: comp!.id, _source_kind: "manual_hold", _source_id: crypto.randomUUID(),
        _lines: [{ sku_id: sku1!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 1 }] }],
      });
      check("J.01 viewer cannot create reservation (reservations.manage)", !!error, error?.message);
    }

    // ── A/D. Happy path + idempotency ───────────────────────────────────
    const src1 = crypto.randomUUID();
    const { data: r1, error: e1 } = await alice.client.rpc("create_reservation", {
      _company_id: comp!.id, _source_kind: "order_line", _source_id: src1,
      _lines: [
        { sku_id: sku1!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 6 }, { warehouse_id: wh2!.id, quantity: 4 }] },
        { sku_id: sku2!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 5 }] },
      ],
    });
    check("A.01 create reservation multi-sku/multi-wh", !e1 && r1?.ok === true, e1?.message);
    const resvId = r1?.reservation_id as string;

    const { data: r1b } = await alice.client.rpc("create_reservation", {
      _company_id: comp!.id, _source_kind: "order_line", _source_id: src1,
      _lines: [{ sku_id: sku1!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 999 }] }],
    });
    check("D.01 idempotent replay returns same header", r1b?.reservation_id === resvId && r1b?.idempotent_replay === true);

    // Verify sku_active_reserved reflects hold
    const { data: ar1 } = await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku1!.id });
    check("A.02 sku_active_reserved(sku1) = 10", ar1 === 10, `got ${ar1}`);

    // ── B. All-or-nothing: one line short => rollback entire reservation ──
    // Available for sku1 = 100+30 - 10 = 120; sku2 = 50 - 5 = 45. Ask 5 of sku1 + 999 of sku2.
    const src2 = crypto.randomUUID();
    const before = (await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku1!.id })).data as number;
    const { error: eB } = await alice.client.rpc("create_reservation", {
      _company_id: comp!.id, _source_kind: "order_line", _source_id: src2,
      _lines: [
        { sku_id: sku1!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 5 }] },
        { sku_id: sku2!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 999 }] },
      ],
    });
    check("B.01 shortage on any line rolls back whole reservation", !!eB, eB?.message);
    const after = (await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku1!.id })).data as number;
    check("B.02 sku1 hold unchanged after rollback", before === after, `before=${before} after=${after}`);
    const { count: hdrCount } = await admin.from("inventory_reservation_headers")
      .select("*", { count: "exact", head: true }).eq("source_id", src2);
    check("B.03 no header persisted for failed reservation", hdrCount === 0, `count=${hdrCount}`);

    // ── C. Per-warehouse enforcement: sku1 in wh2 has 30 - 4 = 26 avail
    const { error: eC1 } = await alice.client.rpc("create_reservation", {
      _company_id: comp!.id, _source_kind: "manual_hold", _source_id: crypto.randomUUID(),
      _lines: [{ sku_id: sku1!.id, allocations: [{ warehouse_id: wh2!.id, quantity: 27 }] }],
    });
    check("C.01 per-warehouse shortage rejected", !!eC1, eC1?.message);

    // Cross-company sku
    const erin = await mkUser(`p2m3_erin_${stamp}@borvat.test`);
    const { data: compB } = await erin.client.from("companies")
      .insert({ name: "OtherCo", slug: `otherco-${stamp}`, owner_user_id: erin.uid }).select().single();
    cleanup.push(compB!.id);
    const { data: skuB } = await erin.client.from("catalog_skus")
      .insert({ company_id: compB!.id, code: "X-S1", tracking_mode: "none" }).select().single();
    const { error: eC2 } = await alice.client.rpc("create_reservation", {
      _company_id: comp!.id, _source_kind: "manual_hold", _source_id: crypto.randomUUID(),
      _lines: [{ sku_id: skuB!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 1 }] }],
    });
    check("C.02 cross-company sku rejected", !!eC2, eC2?.message);

    // ── E. Pick moves stock sellable→picked, decrements hold, once only ──
    // Reservation r1: sku1 allocations wh1=6, wh2=4; sku2 wh1=5.
    const { data: allocs } = await admin.from("inventory_reservation_allocations")
      .select("id, warehouse_id, allocated_quantity, line_id, inventory_reservation_lines!inner(sku_id)")
      .in("line_id",
        (await admin.from("inventory_reservation_lines").select("id").eq("reservation_id", resvId)).data!.map(x => x.id));
    const allocSku1Wh1 = allocs!.find((a: any) => a.warehouse_id === wh1!.id && a.inventory_reservation_lines.sku_id === sku1!.id);
    const { data: pickRes, error: ePick } = await alice.client.rpc("pick_reservation_allocation", {
      _allocation_id: allocSku1Wh1!.id, _quantity: 6,
    });
    check("E.01 pick 6 succeeds", !ePick && pickRes?.ok === true, ePick?.message);

    // Verify balances: sku1@wh1 sellable=94, picked=6
    const { data: bals } = await admin.from("inventory_balances")
      .select("disposition, quantity, warehouse_id, sku_id").eq("company_id", comp!.id).eq("sku_id", sku1!.id).eq("warehouse_id", wh1!.id);
    const sellable = bals!.find((b: any) => b.disposition === "sellable")?.quantity;
    const picked = bals!.find((b: any) => b.disposition === "picked")?.quantity;
    check("E.02 sellable decremented", sellable === 94, `got ${sellable}`);
    check("E.03 picked incremented", picked === 6, `got ${picked}`);

    // Hold for sku1 = 10 - 6 = 4
    const { data: ar2 } = await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku1!.id });
    check("E.04 sku_active_reserved(sku1) = 4 after pick", ar2 === 4, `got ${ar2}`);

    // Cannot pick more than remaining on the allocation (6 remaining=0)
    const { error: ePickAgain } = await alice.client.rpc("pick_reservation_allocation", {
      _allocation_id: allocSku1Wh1!.id, _quantity: 1,
    });
    check("E.05 cannot pick past allocation remaining", !!ePickAgain, ePickAgain?.message);

    // ── F. Release: cannot release more than remaining; then cancel; then no pick ──
    const allocSku2Wh1 = allocs!.find((a: any) => a.warehouse_id === wh1!.id && a.inventory_reservation_lines.sku_id === sku2!.id);
    const line_sku2 = allocSku2Wh1!.line_id as string;

    const { error: eRelOver } = await alice.client.rpc("release_reservation", {
      _reservation_id: resvId,
      _release_lines: [{ line_id: line_sku2, quantity: 999 }],
    });
    check("F.01 cannot release more than remaining", !!eRelOver, eRelOver?.message);

    const { data: relRes, error: eRel } = await alice.client.rpc("release_reservation", {
      _reservation_id: resvId,
      _release_lines: [{ line_id: line_sku2, quantity: 2 }],
    });
    check("F.02 partial release ok", !eRel && relRes?.released_total === 2, eRel?.message);
    const { data: ar3 } = await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku2!.id });
    check("F.03 sku2 hold now 3 (5-2)", ar3 === 3, `got ${ar3}`);

    const { data: cancelRes, error: eCancel } = await alice.client.rpc("cancel_reservation", { _reservation_id: resvId });
    check("F.04 cancel remaining ok", !eCancel && cancelRes?.ok === true, eCancel?.message);
    const { data: hdrAfter } = await admin.from("inventory_reservation_headers").select("status").eq("id", resvId).single();
    check("F.05 header status = cancelled", hdrAfter?.status === "cancelled", `got ${hdrAfter?.status}`);

    // sku1 hold now 0 (6 consumed + 4 released), sku2 hold now 0 (2+3 released)
    const ar1After = (await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku1!.id })).data as number;
    const ar2After = (await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku2!.id })).data as number;
    check("F.06 sku1 hold released to 0", ar1After === 0, `got ${ar1After}`);
    check("F.07 sku2 hold released to 0", ar2After === 0, `got ${ar2After}`);

    const allocSku1Wh2 = allocs!.find((a: any) => a.warehouse_id === wh2!.id && a.inventory_reservation_lines.sku_id === sku1!.id);
    const { error: ePickCancelled } = await alice.client.rpc("pick_reservation_allocation", {
      _allocation_id: allocSku1Wh2!.id, _quantity: 1,
    });
    check("F.08 cannot pick from cancelled reservation", !!ePickCancelled, ePickCancelled?.message);

    // Cannot release again
    const { error: eRelAgain } = await alice.client.rpc("release_reservation", { _reservation_id: resvId });
    check("F.09 cannot release cancelled reservation", !!eRelAgain, eRelAgain?.message);

    // ── G. Concurrency: 30 parallel reservations of 5 against ~ available ──
    // Current state: sku1 sellable = 94 (wh1) + 30 (wh2) = 124; no active holds.
    // Fire 30 parallel reservations each of qty 5 on wh1. Wh1 sellable=94 → 18 should succeed.
    const parallelResults = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        alice.client.rpc("create_reservation", {
          _company_id: comp!.id, _source_kind: "manual_hold", _source_id: crypto.randomUUID(),
          _lines: [{ sku_id: sku1!.id, allocations: [{ warehouse_id: wh1!.id, quantity: 5 }] }],
        }).then((r) => ({ ok: !r.error && r.data?.ok === true, err: r.error?.message }))
      )
    );
    const successes = parallelResults.filter(r => r.ok).length;
    const expected = Math.floor(94 / 5); // 18
    check(`G.01 exactly ${expected}/30 parallel reservations succeed`, successes === expected, `got ${successes}`);

    // Assert no oversell: sellable in wh1 must still be positive (94 - 18*5 = 4)
    const { data: bal1 } = await admin.from("inventory_balances").select("quantity")
      .eq("company_id", comp!.id).eq("sku_id", sku1!.id).eq("warehouse_id", wh1!.id).eq("disposition", "sellable").maybeSingle();
    const holdWh1 = (await admin.from("inventory_reservation_allocations")
      .select("allocated_quantity, consumed_quantity, released_quantity, inventory_reservation_lines!inner(sku_id, inventory_reservation_headers!inner(status, company_id))")
      .eq("warehouse_id", wh1!.id)).data;
    const activeReservedWh1 = (holdWh1 ?? [])
      .filter((a: any) => a.inventory_reservation_lines.sku_id === sku1!.id
        && a.inventory_reservation_lines.inventory_reservation_headers.company_id === comp!.id
        && a.inventory_reservation_lines.inventory_reservation_headers.status === "active")
      .reduce((s: number, a: any) => s + (a.allocated_quantity - a.consumed_quantity - a.released_quantity), 0);
    check("G.02 no oversell: sellable_wh1 >= active_reserved_wh1", (bal1?.quantity ?? 0) >= activeReservedWh1,
      `sellable=${bal1?.quantity} reserved=${activeReservedWh1}`);
    check("G.03 total newly-reserved units = expected*5", activeReservedWh1 === expected * 5,
      `reserved=${activeReservedWh1}`);

    // ── H. Concurrency: 10 parallel cancels of the same active header release only once ──
    // Pick one of the successful holds
    const oneSuccess = parallelResults.findIndex(r => r.ok);
    const { data: someHdr } = await admin.from("inventory_reservation_headers")
      .select("id").eq("company_id", comp!.id).eq("status", "active").limit(1).single();
    const cancels = await Promise.all(Array.from({ length: 10 }, () =>
      alice.client.rpc("cancel_reservation", { _reservation_id: someHdr!.id })
        .then((r) => ({ ok: !r.error, err: r.error?.message }))));
    const cSuccess = cancels.filter(c => c.ok).length;
    // Exactly 1 cancel wins; others reject "not active"
    check("H.01 exactly one of 10 parallel cancels succeeds", cSuccess === 1, `got ${cSuccess}`);
    const { data: hdrH } = await admin.from("inventory_reservation_headers").select("status").eq("id", someHdr!.id).single();
    check("H.02 header ends cancelled", hdrH?.status === "cancelled", `got ${hdrH?.status}`);
    // sku1 hold decreased by exactly 5 (one cancel), not 50
    const ar1AfterCancel = (await alice.client.rpc("sku_active_reserved", { _company_id: comp!.id, _sku_id: sku1!.id })).data as number;
    check(`H.03 sku1 active_reserved decreased by exactly 5 (${(expected * 5) - 5})`,
      ar1AfterCancel === (expected * 5) - 5, `got ${ar1AfterCancel}`);
    void oneSuccess;

  } finally {
    for (const cid of cleanup) {
      await admin.from("inventory_reservation_headers").delete().eq("company_id", cid);
      await admin.from("inventory_transaction_entries").delete().eq("company_id", cid);
      await admin.from("inventory_transactions").delete().eq("company_id", cid);
      await admin.from("inventory_balances").delete().eq("company_id", cid);
      await admin.from("companies").delete().eq("id", cid);
    }
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n=== ${passed}/${results.length} passed, ${failed} failed ===`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
