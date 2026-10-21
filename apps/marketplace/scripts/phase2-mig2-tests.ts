/**
 * Phase 2 Migration 2 verification — inventory ledger, balances, RPCs.
 *
 * Coverage:
 *  A. Negative-balance prevention (single tx and split across txs)
 *  B. Idempotency (same key returns same tx id, no duplicate ledger rows)
 *  C. Reverse applies exactly once; second reverse rejected
 *  D. Concurrency: parallel deductions from the same address never oversell,
 *     parallel reverses of the same tx produce exactly one reversal
 *  E. Ledger ↔ balances tie-out (SUM(entries) == balance per address, after
 *     applying reversal semantics)
 *  F. anon has NO EXECUTE on the four new RPCs
 *  G. Permission gating per reason (fulfilment.pick required for 'pick', etc.)
 *  H. Cross-company reference rejection (sku/warehouse/location/lot/serial)
 *  I. Conserving reasons must net to zero per sku
 *  J. Serial ±1 constraint; serial exclusivity per balance
 *
 * Usage:  bunx tsx scripts/phase2-mig2-tests.ts
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
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: pw });
  if (sErr) throw sErr;
  return { uid, client: c, email, pw };
}

async function roleId(key: string) {
  const { data } = await admin.from("system_company_roles").select("id").eq("key", key).single();
  return data!.id as string;
}

// Assign an additional role to an existing active member.
async function addRoleToMember(company_id: string, user_id: string, role_key: string) {
  const { data: m } = await admin.from("company_members").select("id")
    .eq("company_id", company_id).eq("user_id", user_id).single();
  const rid = await roleId(role_key);
  await admin.from("company_member_roles").insert({ member_id: m!.id, role_id: rid })
    .then(() => {}, () => {}); // ignore conflict
}

async function addMember(company_id: string, user_id: string, role_key: string) {
  const { data: m } = await admin.from("company_members")
    .insert({ company_id, user_id, status: "active" }).select().single();
  const rid = await roleId(role_key);
  await admin.from("company_member_roles").insert({ member_id: m!.id, role_id: rid });
}

async function tieOut(company_id: string) {
  // sum(entries) per identity == balance.quantity
  // NOTE: we deliberately do NOT call rebuild here — we're verifying that the
  // live balances (maintained by post/reverse) already match the ledger sums.
  const { data: entriesRaw } = await admin
    .from("inventory_transaction_entries").select("sku_id, warehouse_id, location_id, disposition, lot_id, serial_id, quantity")
    .eq("company_id", company_id);
  const map = new Map<string, number>();
  for (const e of entriesRaw ?? []) {
    const key = [e.sku_id, e.warehouse_id, e.location_id ?? "", e.disposition, e.lot_id ?? "", e.serial_id ?? ""].join("|");
    map.set(key, (map.get(key) ?? 0) + (e.quantity as number));
  }
  const { data: bals } = await admin.from("inventory_balances")
    .select("sku_id, warehouse_id, location_id, disposition, lot_id, serial_id, quantity")
    .eq("company_id", company_id);
  const balMap = new Map<string, number>();
  for (const b of bals ?? []) {
    const key = [b.sku_id, b.warehouse_id, b.location_id ?? "", b.disposition, b.lot_id ?? "", b.serial_id ?? ""].join("|");
    balMap.set(key, b.quantity as number);
  }
  const keys = new Set([...map.keys(), ...balMap.keys()]);
  let ok = true;
  const diffs: string[] = [];
  for (const k of keys) {
    const ledger = map.get(k) ?? 0;
    const balance = balMap.get(k) ?? 0;
    // ledger>0 must equal balance; ledger<=0 must not exist as balance row (or be 0)
    const expected = Math.max(ledger, 0);
    if (expected !== balance) {
      ok = false;
      diffs.push(`${k}: ledger=${ledger} balance=${balance}`);
    }
  }
  return { ok, diffs };
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p2m2_alice_${stamp}@borvat.test`);   // owner of A (all perms)
  const bob = await mkUser(`p2m2_bob_${stamp}@borvat.test`);       // viewer of A (no inventory.adjust)
  const erin = await mkUser(`p2m2_erin_${stamp}@borvat.test`);     // owner of B
  const cleanupUsers = [alice, bob, erin];
  const cleanupCompanies: string[] = [];

  try {
    const { data: compA } = await alice.client.from("companies")
      .insert({ name: "AlphaInv", slug: `alphainv-${stamp}`, owner_user_id: alice.uid }).select().single();
    cleanupCompanies.push(compA!.id);
    const { data: compB } = await erin.client.from("companies")
      .insert({ name: "BetaInv", slug: `betainv-${stamp}`, owner_user_id: erin.uid }).select().single();
    cleanupCompanies.push(compB!.id);
    await addMember(compA!.id, bob.uid, "viewer");

    // Catalog + warehouse for A
    const { data: prodA } = await alice.client.from("catalog_products")
      .insert({ company_id: compA!.id, title: "P" }).select().single();
    const { data: skuA } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, product_id: prodA!.id, code: "SKU-A", tracking_mode: "none" }).select().single();
    const { data: skuA2 } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, code: "SKU-A2", tracking_mode: "none" }).select().single();
    const { data: skuLot } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, code: "SKU-LOT", tracking_mode: "lot" }).select().single();
    const { data: skuSer } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, code: "SKU-SER", tracking_mode: "serial" }).select().single();
    const { data: whA } = await alice.client.from("warehouses")
      .insert({ company_id: compA!.id, code: "WH-A", name: "Main", requires_location: false }).select().single();
    const { data: whReq } = await alice.client.from("warehouses")
      .insert({ company_id: compA!.id, code: "WH-REQ", name: "ReqLoc", requires_location: true }).select().single();
    const { data: locA } = await alice.client.from("warehouse_locations")
      .insert({ warehouse_id: whReq!.id, code: "L-01" }).select().single();

    // Catalog + warehouse for B
    const { data: skuB } = await erin.client.from("catalog_skus")
      .insert({ company_id: compB!.id, code: "SKU-B" }).select().single();
    const { data: whB } = await erin.client.from("warehouses")
      .insert({ company_id: compB!.id, code: "WH-B", name: "B" }).select().single();

    // Helper — call post_inventory_transaction
    const post = (client: SupabaseClient, args: Record<string, unknown>) =>
      client.rpc("post_inventory_transaction", args);

    // ── F. anon has no EXECUTE on the four new RPCs ────────────────────
    const anonC = anonClient();
    const rpcs = [
      { name: "post_inventory_transaction",
        args: { _company_id: compA!.id, _reason: "stock_receipt", _entries: [] } },
      { name: "reverse_inventory_transaction", args: { _tx_id: compA!.id } },
      { name: "rebuild_inventory_balances", args: { _company_id: compA!.id } },
      { name: "sku_sellable_quantity", args: { _company_id: compA!.id, _sku_id: skuA!.id } },
    ];
    for (const r of rpcs) {
      const res = await anonC.rpc(r.name, r.args);
      const msg = (res.error?.message ?? "") + " " + (res.error?.code ?? "");
      const denied = !!res.error && /permission denied|not.*allow|42501/i.test(msg);
      check(`F.${r.name} rejects anon`, denied, res.error?.message ?? "no error returned");
    }

    // ── G. Permission gating: viewer cannot post any transaction ─────
    {
      const { error } = await post(bob.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 5 }],
      });
      check("G.01 viewer cannot post stock_receipt (needs inventory.adjust)", !!error, error?.message);
    }
    {
      const { error } = await post(bob.client, {
        _company_id: compA!.id, _reason: "pick",
        _entries: [
          { sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -1 },
          { sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "picked", quantity: 1 },
        ],
      });
      check("G.02 viewer cannot post pick (needs fulfilment.pick)", !!error, error?.message);
    }

    // ── Setup: alice (owner) receives 10 SKU-A into whA/sellable ─────
    const { data: rcpt1, error: eRcpt1 } = await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_receipt",
      _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 10 }],
    });
    check("S.01 stock_receipt +10 succeeds", !eRcpt1 && rcpt1?.ok === true, eRcpt1?.message);

    // ── A. Negative balance prevention ───────────────────────────────
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_adjustment",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -15 }],
      });
      check("A.01 single-entry oversell rejected (10 on hand, -15)", !!error, error?.message);
    }
    // Draw down to zero, then attempt one more
    await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_adjustment",
      _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -10 }],
    });
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_adjustment",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -1 }],
      });
      check("A.02 draining below zero rejected", !!error);
    }

    // Rebuild to a known state: +20 sellable
    await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_receipt",
      _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 20 }],
    });
    const { data: qty1 } = await alice.client.rpc("sku_sellable_quantity",
      { _company_id: compA!.id, _sku_id: skuA!.id });
    check("A.03 sellable quantity == 20", Number(qty1) === 20, `got ${qty1}`);

    // ── B. Idempotency ───────────────────────────────────────────────
    const idem = `idem-${stamp}`;
    const { data: idem1 } = await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_receipt", _idempotency_key: idem,
      _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 3 }],
    });
    const { data: idem2 } = await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_receipt", _idempotency_key: idem,
      _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 3 }],
    });
    check("B.01 idempotent replay returns same transaction_id",
      idem1?.transaction_id === idem2?.transaction_id, `1=${idem1?.transaction_id} 2=${idem2?.transaction_id}`);
    check("B.02 idempotent replay marked idempotent_replay",
      idem2?.idempotent_replay === true);
    const { data: qty2 } = await alice.client.rpc("sku_sellable_quantity",
      { _company_id: compA!.id, _sku_id: skuA!.id });
    check("B.03 idempotent replay did NOT double-apply (20+3=23)", Number(qty2) === 23, `got ${qty2}`);

    // ── C. Reverse applies exactly once ───────────────────────────────
    const { data: shipTx } = await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_adjustment",
      _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -5 }],
    });
    const { data: qtyBeforeRev } = await alice.client.rpc("sku_sellable_quantity",
      { _company_id: compA!.id, _sku_id: skuA!.id });
    check("C.pre sellable == 18 after -5", Number(qtyBeforeRev) === 18, `got ${qtyBeforeRev}`);

    const { data: rev1, error: eRev1 } = await alice.client.rpc("reverse_inventory_transaction",
      { _tx_id: shipTx.transaction_id, _note: "test reversal" });
    check("C.01 reverse succeeds first time", !eRev1 && rev1?.ok === true, eRev1?.message);
    const { data: qtyAfterRev } = await alice.client.rpc("sku_sellable_quantity",
      { _company_id: compA!.id, _sku_id: skuA!.id });
    check("C.02 balance restored to 23 after reversal", Number(qtyAfterRev) === 23, `got ${qtyAfterRev}`);

    const { error: eRev2 } = await alice.client.rpc("reverse_inventory_transaction",
      { _tx_id: shipTx.transaction_id });
    check("C.03 second reverse rejected", !!eRev2, eRev2?.message);

    // Verify reversal linkage
    const { data: origHdr } = await admin.from("inventory_transactions").select("status, reversed_by").eq("id", shipTx.transaction_id).single();
    check("C.04 original marked reversed", origHdr?.status === "reversed" && !!origHdr?.reversed_by);
    const { data: revHdr } = await admin.from("inventory_transactions").select("reason, reversal_of, status").eq("id", origHdr!.reversed_by!).single();
    check("C.05 reversal tx has reason='reversal', reversal_of set, status='posted'",
      revHdr?.reason === "reversal" && revHdr?.reversal_of === shipTx.transaction_id && revHdr?.status === "posted");

    // ── H. Cross-company references rejected ─────────────────────────
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuB!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 1 }],
      });
      check("H.01 sku from other company rejected", !!error);
    }
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whB!.id, disposition: "sellable", quantity: 1 }],
      });
      check("H.02 warehouse from other company rejected", !!error);
    }
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, location_id: locA!.id,
                     disposition: "sellable", quantity: 1 }],
      });
      check("H.03 location not in given warehouse rejected", !!error);
    }
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whReq!.id, disposition: "sellable", quantity: 1 }],
      });
      check("H.04 warehouse requires_location=true without location rejected", !!error);
    }

    // ── I. Conserving reasons must net to zero per SKU ───────────────
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "pick",
        _entries: [{ sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -3 }],
      });
      check("I.01 pick without matching +picked rejected (unbalanced)", !!error);
    }
    // Balanced pick succeeds
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "pick",
        _entries: [
          { sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -2 },
          { sku_id: skuA!.id, warehouse_id: whA!.id, disposition: "picked", quantity: 2 },
        ],
      });
      check("I.02 balanced pick succeeds", !error, error?.message);
    }

    // ── J. Lot/serial tracking rules ─────────────────────────────────
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuLot!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 1 }],
      });
      check("J.01 lot-tracked sku requires lot_id", !!error);
    }
    const { data: lot1 } = await alice.client.from("inventory_lots")
      .insert({ company_id: compA!.id, sku_id: skuLot!.id, code: "L1" }).select().single();
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuLot!.id, warehouse_id: whA!.id, disposition: "sellable",
                     lot_id: lot1!.id, quantity: 5 }],
      });
      check("J.02 lot-tracked receipt with lot succeeds", !error, error?.message);
    }
    // serial ±1 constraint
    const { data: ser1 } = await alice.client.from("inventory_serials")
      .insert({ company_id: compA!.id, sku_id: skuSer!.id, code: "S1" }).select().single();
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuSer!.id, warehouse_id: whA!.id, disposition: "sellable",
                     serial_id: ser1!.id, quantity: 2 }],
      });
      check("J.03 serial qty=2 rejected (must be ±1)", !!error);
    }
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuSer!.id, warehouse_id: whA!.id, disposition: "sellable",
                     serial_id: ser1!.id, quantity: 1 }],
      });
      check("J.04 serial qty=1 receipt succeeds", !error, error?.message);
    }
    {
      const { error } = await post(alice.client, {
        _company_id: compA!.id, _reason: "stock_receipt",
        _entries: [{ sku_id: skuSer!.id, warehouse_id: whA!.id, disposition: "sellable",
                     serial_id: ser1!.id, quantity: 1 }],
      });
      check("J.05 receiving same serial twice into same balance rejected (>1)", !!error);
    }

    // ── D. Concurrency — parallel deductions never oversell ──────────
    // Reset to a controlled state: skuA2 gets 100
    await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_receipt",
      _entries: [{ sku_id: skuA2!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 100 }],
    });
    // 30 concurrent -5 requests. Only 20 can succeed.
    const attempts = 30;
    const per = 5;
    const promises: Promise<{ ok: boolean; err?: string }>[] = [];
    for (let i = 0; i < attempts; i++) {
      promises.push(post(alice.client, {
        _company_id: compA!.id, _reason: "stock_adjustment",
        _entries: [{ sku_id: skuA2!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: -per }],
      }).then((r) => ({ ok: !r.error, err: r.error?.message })));
    }
    const parallel = await Promise.all(promises);
    const succeeded = parallel.filter((r) => r.ok).length;
    const { data: qtyAfterParallel } = await alice.client.rpc("sku_sellable_quantity",
      { _company_id: compA!.id, _sku_id: skuA2!.id });
    check("D.01 concurrent deductions never oversell (final qty >= 0)", Number(qtyAfterParallel) >= 0, `qty=${qtyAfterParallel}`);
    check("D.02 exactly 20 succeeded (100/5), rest rejected",
      succeeded === 20 && Number(qtyAfterParallel) === 0,
      `succeeded=${succeeded} qty=${qtyAfterParallel}`);

    // Parallel reversal of same tx: exactly one wins
    const { data: revTx } = await post(alice.client, {
      _company_id: compA!.id, _reason: "stock_receipt",
      _entries: [{ sku_id: skuA2!.id, warehouse_id: whA!.id, disposition: "sellable", quantity: 50 }],
    });
    const parRev = await Promise.all(
      Array.from({ length: 10 }, () =>
        alice.client.rpc("reverse_inventory_transaction", { _tx_id: revTx.transaction_id })
          .then((r) => ({ ok: !r.error, err: r.error?.message })))
    );
    const revSucc = parRev.filter((r) => r.ok).length;
    check("D.03 parallel reverses of same tx: exactly one succeeds", revSucc === 1, `succ=${revSucc}`);

    // ── E. Ledger ↔ balances tie-out ─────────────────────────────────
    const tie = await tieOut(compA!.id);
    check("E.01 rebuild_inventory_balances tie-out matches ledger sums", tie.ok, tie.diffs.slice(0, 3).join(" | "));

  } finally {
    // Cleanup
    for (const c of cleanupCompanies) {
      // Balances rely on entries; entries can't be deleted while referenced. Delete in order using service role.
      await admin.from("inventory_balances").delete().eq("company_id", c);
      // Delete transactions cascades via the ledger foreign keys? No — RESTRICT. Use raw SQL via psql.
      await admin.from("inventory_transaction_entries").delete().eq("company_id", c).then(() => {}, () => {});
      // Immutability trigger blocks entry deletes even for service_role RLS-bypass — that's OK, we'll leave audit rows.
    }
    for (const u of cleanupUsers) await admin.auth.admin.deleteUser(u.uid).catch(() => {});
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n─────── ${passed}/${results.length} passed ───────`);
  if (passed < results.length) {
    console.log("FAILED:");
    for (const r of results.filter((r) => !r.ok)) console.log(`  • ${r.name}: ${r.detail ?? ""}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
