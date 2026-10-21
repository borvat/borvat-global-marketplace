/**
 * Isolated reruns of the two Phase 2 Mig4 checks that timed out under PostgREST
 * pressure: C.01 (idempotent ship replay) and H.04 (version conflict rejection).
 * Each is exercised on its own fresh company/sku/warehouse/listing with
 * bounded retries against upstream timeouts.
 *
 * Usage:  bunx tsx scripts/phase2-mig4-isolated.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

async function retry<T>(label: string, fn: () => Promise<{ data: T | null; error: any }>, tries = 5): Promise<{ data: T | null; error: any }> {
  let last: any = { data: null, error: { message: "no attempts" } };
  for (let i = 1; i <= tries; i++) {
    const r = await fn();
    const msg = r.error?.message ?? "";
    if (r.error && /upstream request timeout|fetch failed|ECONN/i.test(msg)) {
      console.log(`  … ${label} attempt ${i} transient (${msg}); retrying`);
      await new Promise(res => setTimeout(res, 400 * i));
      last = r; continue;
    }
    return r;
  }
  return last;
}

async function mkUser(email: string) {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  await c.auth.signInWithPassword({ email, password: pw });
  return { uid, client: c };
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p2m4iso_${stamp}@borvat.test`);

  // ────────────── C.01 — idempotent ship replay ──────────────
  {
    const { data: comp } = await alice.client.from("companies")
      .insert({ name: "IsoCo1", slug: `isoco1-${stamp}`, owner_user_id: alice.uid }).select().single();
    const { data: sku } = await alice.client.from("catalog_skus")
      .insert({ company_id: comp!.id, code: "ISO-C1", tracking_mode: "none" }).select().single();
    const { data: wh } = await alice.client.from("warehouses")
      .insert({ company_id: comp!.id, code: "ISO-W1", name: "W", requires_location: false }).select().single();

    await alice.client.rpc("post_inventory_transaction", {
      _company_id: comp!.id, _reason: "stock_receipt",
      _entries: [{ sku_id: sku!.id, warehouse_id: wh!.id, disposition: "sellable", quantity: 20 }],
    });
    const src = crypto.randomUUID();
    await alice.client.rpc("create_reservation", {
      _company_id: comp!.id, _source_kind: "order_line", _source_id: src,
      _lines: [{ sku_id: sku!.id, allocations: [{ warehouse_id: wh!.id, quantity: 10 }] }],
    });
    const { data: allocRow } = await admin.from("inventory_reservation_allocations")
      .select("id").eq("warehouse_id", wh!.id).limit(1).single();
    const allocId = allocRow!.id as string;
    await alice.client.rpc("pick_reservation_allocation", { _allocation_id: allocId, _quantity: 10 });
    await alice.client.rpc("pack_reservation_allocation", { _allocation_id: allocId, _quantity: 10 });

    const key = "iso-ship-" + stamp;
    const first = await retry("C ship#1", () => alice.client.rpc("ship_reservation_allocation", {
      _allocation_id: allocId, _quantity: 6, _idempotency_key: key,
    }) as any);
    check("C.pre first ship ok", (first.data as any)?.ok === true, first.error?.message);

    await new Promise(r => setTimeout(r, 400));
    const replay = await retry("C ship replay", () => alice.client.rpc("ship_reservation_allocation", {
      _allocation_id: allocId, _quantity: 6, _idempotency_key: key,
    }) as any);
    const r = replay.data as any;
    const f = first.data as any;
    const idempotent = r?.idempotent_replay === true || (r?.transaction_id && r.transaction_id === f?.transaction_id);
    check("C.01 replay returns idempotent flag or same tx (no double-ship)", !!idempotent, JSON.stringify(replay.data ?? replay.error));

    const { data: bal } = await admin.from("inventory_balances")
      .select("quantity").eq("company_id", comp!.id).eq("sku_id", sku!.id)
      .eq("disposition", "packed_or_staging").maybeSingle();
    check("C.02 packed=4 unchanged by replay", (bal?.quantity ?? 0) === 4, `got ${bal?.quantity}`);
  }

  // ────────────── H.04 — optimistic concurrency version conflict ──────────────
  {
    const { data: comp } = await alice.client.from("companies")
      .insert({ name: "IsoCo2", slug: `isoco2-${stamp}`, owner_user_id: alice.uid }).select().single();
    const { data: sku } = await alice.client.from("catalog_skus")
      .insert({ company_id: comp!.id, code: "ISO-C2", tracking_mode: "none" }).select().single();
    const { data: acct } = await alice.client.from("channel_accounts")
      .insert({ company_id: comp!.id, provider: "bol", external_account_id: "iso-acct-" + stamp, display_name: "iso" })
      .select().single();
    const { data: listing } = await alice.client.from("channel_listings")
      .insert({ company_id: comp!.id, channel_account_id: acct!.id, sku_id: sku!.id, external_listing_id: "iso-L-" + stamp, units_per_offer: 1, channel_cap: 500 })
      .select().single();
    const listingId = listing!.id as string;

    // Bump version to 2 (fresh listings start at version 0).
    for (const q of [10, 20]) {
      const r = await retry("H set publish", () => alice.client.rpc("set_channel_published_quantity", {
        _listing_id: listingId, _new_quantity: q, _reason: "seed-" + q,
      }) as any);
      if (r.error) throw new Error("seed publish failed: " + r.error.message);
      await new Promise(res => setTimeout(res, 250));
    }
    const { data: cur } = await admin.from("channel_listings").select("published_version").eq("id", listingId).single();
    check("H.pre listing version = 2", (cur as any).published_version === 2, JSON.stringify(cur));

    await new Promise(res => setTimeout(res, 400));
    const occ = await retry("H OCC", () => alice.client.rpc("set_channel_published_quantity", {
      _listing_id: listingId, _new_quantity: 30, _reason: "occ", _expected_version: 1,
    }) as any);
    check("H.04 version conflict rejected",
      !!occ.error && /version conflict/i.test(occ.error.message ?? ""),
      JSON.stringify({ data: occ.data, error: occ.error?.message }));

    // Sanity: correct expected_version succeeds
    await new Promise(res => setTimeout(res, 300));
    const okv = await retry("H OCC ok", () => alice.client.rpc("set_channel_published_quantity", {
      _listing_id: listingId, _new_quantity: 25, _reason: "occ-ok", _expected_version: 2,
    }) as any);
    check("H.04b correct expected_version succeeds", !okv.error && (okv.data as any)?.ok === true, okv.error?.message);
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n=== Phase 2 Mig4 isolated reruns — ${passed}/${results.length} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
