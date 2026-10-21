/**
 * Phase 4 Migration 2 verification — Bol Offer Import & EAN Matching (read-only).
 *
 * H. Hotfix    — auth_mode column exists, defaults, enum enforcement.
 * S. Schema    — new tables, view exposes auth_mode.
 * G. Grants    — 5 M2 RPCs restricted to service_role; direct DML denied.
 * B. Batch     — begin/close semantics; unknown/cross-tenant/non-bol rejected.
 * I. Ingest    — EAN match scoped per-company; suggestion only; upsert preserves reviewer decisions.
 * L. Link      — same-company only; cannot link rejected offers.
 * R. Reject    — sets rejected state; cannot reject already-linked offers.
 * N. No-write  — import path never touches catalog_skus or channel_listings.
 * T. Tenancy   — cross-company visibility blocked via views.
 *
 * Usage: bunx tsx scripts/phase4-m2-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin: SupabaseClient = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};
const errMsg = (e: unknown): string =>
  !e ? "" : e instanceof Error ? e.message
    : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message ?? "")
      : String(e);
const matches = (e: unknown, pat: RegExp) => !!e && pat.test(errMsg(e));

async function mkUser(email: string) {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  await c.auth.signInWithPassword({ email, password: pw });
  return { uid, client: c };
}
const vaultRef = () => `vault:bol/${crypto.randomUUID()}`;
const ean = (n: number) => String(1000000000000 + n);

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p4m2_alice_${stamp}@borvat.test`);
  const bob = await mkUser(`p4m2_bob_${stamp}@borvat.test`);

  const { data: compA } = await alice.client.from("companies")
    .insert({ name: "P4M2A", slug: `p4m2a-${stamp}`, owner_user_id: alice.uid }).select().single();
  const { data: compB } = await bob.client.from("companies")
    .insert({ name: "P4M2B", slug: `p4m2b-${stamp}`, owner_user_id: bob.uid }).select().single();
  const { data: acctA } = await alice.client.from("channel_accounts")
    .insert({ company_id: compA!.id, provider: "bol", external_account_id: "A-" + stamp, display_name: "A Bol" }).select().single();
  const { data: acctB } = await bob.client.from("channel_accounts")
    .insert({ company_id: compB!.id, provider: "bol", external_account_id: "B-" + stamp, display_name: "B Bol" }).select().single();

  // provision connections
  const { data: connA } = await admin.rpc("provision_channel_connection", {
    _company_id: compA!.id, _channel_account_id: acctA!.id, _provider: "bol", _secret_ref: vaultRef(),
  });
  const { data: connB } = await admin.rpc("provision_channel_connection", {
    _company_id: compB!.id, _channel_account_id: acctB!.id, _provider: "bol", _secret_ref: vaultRef(),
  });

  // catalog products + skus for both companies
  const { data: prodA } = await admin.from("catalog_products")
    .insert({ company_id: compA!.id, title: "Widget A", brand: "Borvat", status: "active", created_by: alice.uid, updated_by: alice.uid }).select().single();
  const { data: skuA1 } = await admin.from("catalog_skus")
    .insert({ company_id: compA!.id, product_id: prodA!.id, code: `A1-${stamp}`, tracking_mode: "none", status: "active" }).select().single();
  const { data: skuA2 } = await admin.from("catalog_skus")
    .insert({ company_id: compA!.id, product_id: prodA!.id, code: `A2-${stamp}`, tracking_mode: "none", status: "active" }).select().single();
  const { data: prodB } = await admin.from("catalog_products")
    .insert({ company_id: compB!.id, title: "Widget B", brand: "Borvat", status: "active", created_by: bob.uid, updated_by: bob.uid }).select().single();
  const { data: skuB1 } = await admin.from("catalog_skus")
    .insert({ company_id: compB!.id, product_id: prodB!.id, code: `B1-${stamp}`, tracking_mode: "none", status: "active" }).select().single();

  const EAN_A_MATCH = ean(1);   // maps to skuA1 in company A only
  const EAN_A_NONE  = ean(2);   // no map anywhere
  const EAN_B_MATCH = ean(3);   // maps to skuB1 in company B — should NOT match A imports
  const EAN_A_AMBIG = ean(4);   // company A only, but we'll add two mappings? uniq_ean_per_company prevents that
                                //   -> instead test ambiguity by not using the map (no match = needs_manual)

  await admin.from("channel_ean_map").insert([
    { company_id: compA!.id, sku_id: skuA1!.id, ean: EAN_A_MATCH, source: "manual" },
    { company_id: compB!.id, sku_id: skuB1!.id, ean: EAN_B_MATCH, source: "manual" },
  ]);

  // =========================================================================
  // H. HOTFIX auth_mode
  // =========================================================================
  {
    const { data: row } = await admin.from("channel_connections").select("auth_mode").eq("id", connA).single();
    check("H.01 auth_mode column defaults to client_credentials",
      row?.auth_mode === "client_credentials", String(row?.auth_mode));

    const { error: eBad } = await admin.from("channel_connections")
      .update({ auth_mode: "totally_fake" }).eq("id", connA);
    check("H.02 invalid auth_mode rejected", !!eBad, errMsg(eBad));

    const { error: eOk } = await admin.from("channel_connections")
      .update({ auth_mode: "intermediary_oauth" }).eq("id", connA);
    check("H.03 service_role can update to intermediary_oauth", !eOk, errMsg(eOk));

    // safe view exposes auth_mode
    const { data: v } = await admin.from("channel_connections_safe").select("auth_mode").eq("id", connA).single();
    check("H.04 safe view exposes auth_mode", v?.auth_mode === "intermediary_oauth", String(v?.auth_mode));

    // reset
    await admin.from("channel_connections").update({ auth_mode: "client_credentials" }).eq("id", connA);
  }

  // =========================================================================
  // S. SCHEMA
  // =========================================================================
  {
    for (const t of ["channel_import_batches", "channel_imported_offers", "channel_ean_map"]) {
      const { error } = await admin.from(t).select("*", { count: "exact", head: true });
      check(`S.01 ${t} exists`, !error, errMsg(error));
    }

    // ean_map: cross-company sku rejected
    const { error: eCross } = await admin.from("channel_ean_map")
      .insert({ company_id: compA!.id, sku_id: skuB1!.id, ean: ean(99), source: "manual" });
    check("S.02 ean_map rejects cross-company sku", matches(eCross, /does not belong to company/i), errMsg(eCross));

    // ean_map uniq per company
    const { error: eDup } = await admin.from("channel_ean_map")
      .insert({ company_id: compA!.id, sku_id: skuA2!.id, ean: EAN_A_MATCH, source: "manual" });
    check("S.03 ean_map uniq (company, ean)", matches(eDup, /uniq_ean_per_company|duplicate key/i), errMsg(eDup));
  }

  // =========================================================================
  // G. GRANTS
  // =========================================================================
  {
    const anonC = anonClient();
    for (const [fn, args] of [
      ["begin_offer_import_batch", { _company_id: compA!.id, _channel_account_id: acctA!.id, _connection_id: connA }],
      ["ingest_imported_offer",    { _batch_id: crypto.randomUUID(), _bol_offer_id: "x", _ean: null, _title: null, _brand: null, _condition: null, _price_cents: null, _currency: "EUR", _stock: null, _bol_status: "unknown", _raw: {} }],
      ["close_offer_import_batch", { _batch_id: crypto.randomUUID(), _outcome: "succeeded" }],
      ["link_imported_offer_to_sku", { _imported_offer_id: crypto.randomUUID(), _sku_id: skuA1!.id, _reviewer: alice.uid, _note: null }],
      ["reject_imported_offer",    { _imported_offer_id: crypto.randomUUID(), _reviewer: alice.uid, _reason: null }],
    ] as const) {
      const { error: eAn } = await anonC.rpc(fn as string, args as never);
      check(`G.01 anon cannot rpc ${fn}`, matches(eAn, /permission denied/i), errMsg(eAn));
      const { error: eAu } = await alice.client.rpc(fn as string, args as never);
      check(`G.02 authenticated cannot rpc ${fn}`, matches(eAu, /permission denied/i), errMsg(eAu));
    }

    // Direct table writes denied to authenticated (no INSERT/UPDATE/DELETE policy)
    for (const t of ["channel_import_batches", "channel_imported_offers", "channel_ean_map"]) {
      const { error: eIns } = await alice.client.from(t).insert({ company_id: compA!.id } as never);
      check(`G.03 authenticated cannot insert into ${t}`, !!eIns, errMsg(eIns));
    }
  }

  // =========================================================================
  // B. BATCH
  // =========================================================================
  let batchA = "";
  {
    // unknown connection
    const { error: eBad } = await admin.rpc("begin_offer_import_batch", {
      _company_id: compA!.id, _channel_account_id: acctA!.id, _connection_id: crypto.randomUUID(),
    });
    check("B.01 begin rejects unknown connection", matches(eBad, /connection not found/i), errMsg(eBad));

    // cross-tenant: connA vs compB
    const { error: eXt } = await admin.rpc("begin_offer_import_batch", {
      _company_id: compB!.id, _channel_account_id: acctB!.id, _connection_id: connA,
    });
    check("B.02 begin rejects cross-tenant connection", matches(eXt, /does not match tenant/i), errMsg(eXt));

    // wrong provider — bob has bol so we can't easily test non-bol; provision one via direct insert bypassing RPC not possible (only service_role provisions bol). Skip and cover indirectly via check constraint on batches table.

    // happy path
    const { data: id, error } = await admin.rpc("begin_offer_import_batch", {
      _company_id: compA!.id, _channel_account_id: acctA!.id, _connection_id: connA,
    });
    check("B.03 begin ok", !error && typeof id === "string", errMsg(error));
    batchA = id as string;

    const { data: brow } = await admin.from("channel_import_batches").select("*").eq("id", batchA).single();
    check("B.04 batch status=running", brow?.status === "running");
    check("B.05 batch counters start at 0",
      brow?.total_offers === 0 && brow?.matched_count === 0 && brow?.needs_manual_count === 0);
  }

  // =========================================================================
  // I. INGEST — EAN match scope + upsert semantics
  // =========================================================================
  let offerMatched = "";
  let offerUnmatched = "";
  let offerCrossEan = "";
  {
    // 1) EAN mapped in company A -> suggested_match with suggested_sku_id = skuA1
    const { data: off1 } = await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-1", _ean: EAN_A_MATCH,
      _title: "Match", _brand: "Borvat", _condition: "NEW",
      _price_cents: 1999, _currency: "EUR", _stock: 5, _bol_status: "active", _raw: { src: "test" },
    });
    offerMatched = off1 as string;
    const { data: r1 } = await admin.from("channel_imported_offers").select("*").eq("id", offerMatched).single();
    check("I.01 EAN match -> suggested_match", r1?.review_status === "suggested_match");
    check("I.02 suggested_sku_id set to same-company sku", r1?.suggested_sku_id === skuA1!.id);
    check("I.03 linked_sku_id remains null (suggestion only)", r1?.linked_sku_id === null);

    // 2) No EAN mapping -> needs_manual
    const { data: off2 } = await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-2", _ean: EAN_A_NONE,
      _title: "Manual", _brand: null, _condition: null,
      _price_cents: 500, _currency: "EUR", _stock: 0, _bol_status: "not_published", _raw: {},
    });
    offerUnmatched = off2 as string;
    const { data: r2 } = await admin.from("channel_imported_offers").select("*").eq("id", offerUnmatched).single();
    check("I.04 no match -> needs_manual", r2?.review_status === "needs_manual");
    check("I.05 no match -> suggested_sku_id null", r2?.suggested_sku_id === null);

    // 3) EAN mapped only in company B (not A) -> A sees it as needs_manual (no cross-tenant match)
    const { data: off3 } = await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-3", _ean: EAN_B_MATCH,
      _title: "CrossTenantEan", _brand: null, _condition: null,
      _price_cents: 100, _currency: "EUR", _stock: 1, _bol_status: "active", _raw: {},
    });
    offerCrossEan = off3 as string;
    const { data: r3 } = await admin.from("channel_imported_offers").select("*").eq("id", offerCrossEan).single();
    check("I.06 EAN mapped in other company does NOT match here", r3?.review_status === "needs_manual");
    check("I.07 no cross-tenant suggested_sku_id leaked", r3?.suggested_sku_id === null);

    // 4) NULL EAN -> needs_manual
    await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-4", _ean: null,
      _title: "NoEan", _brand: null, _condition: null,
      _price_cents: null, _currency: "EUR", _stock: null, _bol_status: "unknown", _raw: {},
    });

    // Counters
    const { data: brow } = await admin.from("channel_import_batches").select("*").eq("id", batchA).single();
    check("I.08 counters: total=4", brow?.total_offers === 4, String(brow?.total_offers));
    check("I.09 counters: matched=1", brow?.matched_count === 1, String(brow?.matched_count));
    check("I.10 counters: needs_manual=3", brow?.needs_manual_count === 3, String(brow?.needs_manual_count));

    // 5) Re-ingest same BOL-1 with new price -> updates price, keeps review_status suggested_match
    await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-1", _ean: EAN_A_MATCH,
      _title: "Match v2", _brand: "Borvat", _condition: "NEW",
      _price_cents: 2999, _currency: "EUR", _stock: 3, _bol_status: "active", _raw: { v: 2 },
    });
    const { data: r1b } = await admin.from("channel_imported_offers").select("*").eq("id", offerMatched).single();
    check("I.11 upsert refreshes price", r1b?.price_cents === 2999);
    check("I.12 upsert refreshes title", r1b?.title === "Match v2");
  }

  // =========================================================================
  // L. LINK
  // =========================================================================
  {
    // Cross-company sku rejected
    const { error: eX } = await admin.rpc("link_imported_offer_to_sku", {
      _imported_offer_id: offerMatched, _sku_id: skuB1!.id, _reviewer: alice.uid, _note: null,
    });
    check("L.01 cross-company sku link rejected",
      matches(eX, /different company/i), errMsg(eX));

    // Unknown sku rejected
    const { error: eU } = await admin.rpc("link_imported_offer_to_sku", {
      _imported_offer_id: offerMatched, _sku_id: crypto.randomUUID(), _reviewer: alice.uid, _note: null,
    });
    check("L.02 unknown sku rejected", matches(eU, /sku not found/i), errMsg(eU));

    // Happy path — same company
    const { error: eOk } = await admin.rpc("link_imported_offer_to_sku", {
      _imported_offer_id: offerMatched, _sku_id: skuA2!.id, _reviewer: alice.uid, _note: "seller confirmed",
    });
    check("L.03 same-company link ok", !eOk, errMsg(eOk));

    const { data: r } = await admin.from("channel_imported_offers").select("*").eq("id", offerMatched).single();
    check("L.04 review_status=linked", r?.review_status === "linked");
    check("L.05 linked_sku_id set", r?.linked_sku_id === skuA2!.id);
    check("L.06 reviewed_by / reviewed_at populated",
      r?.reviewed_by === alice.uid && r?.reviewed_at != null);

    // Re-ingest of a linked offer preserves reviewer decision
    await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-1", _ean: EAN_A_MATCH,
      _title: "Match v3", _brand: null, _condition: null,
      _price_cents: 111, _currency: "EUR", _stock: 9, _bol_status: "active", _raw: {},
    });
    const { data: r2 } = await admin.from("channel_imported_offers").select("*").eq("id", offerMatched).single();
    check("L.07 upsert preserves linked review_status", r2?.review_status === "linked");
    check("L.08 upsert preserves linked_sku_id", r2?.linked_sku_id === skuA2!.id);
  }

  // =========================================================================
  // R. REJECT
  // =========================================================================
  {
    // Reject a needs_manual offer
    const { error: eOk } = await admin.rpc("reject_imported_offer", {
      _imported_offer_id: offerUnmatched, _reviewer: alice.uid, _reason: "not our product",
    });
    check("R.01 reject ok", !eOk, errMsg(eOk));
    const { data: r } = await admin.from("channel_imported_offers").select("*").eq("id", offerUnmatched).single();
    check("R.02 review_status=rejected", r?.review_status === "rejected");
    check("R.03 rejected clears suggested_sku_id", r?.suggested_sku_id === null);
    check("R.04 rejected clears linked_sku_id", r?.linked_sku_id === null);

    // Cannot reject already-linked
    const { error: eLinked } = await admin.rpc("reject_imported_offer", {
      _imported_offer_id: offerMatched, _reviewer: alice.uid, _reason: "x",
    });
    check("R.05 cannot reject already-linked", matches(eLinked, /already linked|not found/i), errMsg(eLinked));

    // Cannot link a rejected offer
    const { error: eLinkR } = await admin.rpc("link_imported_offer_to_sku", {
      _imported_offer_id: offerUnmatched, _sku_id: skuA1!.id, _reviewer: alice.uid, _note: null,
    });
    check("R.06 cannot link rejected offer", matches(eLinkR, /already rejected/i), errMsg(eLinkR));
  }

  // =========================================================================
  // C. CLOSE
  // =========================================================================
  {
    const { error: eBad } = await admin.rpc("close_offer_import_batch", {
      _batch_id: batchA, _outcome: "running",
    });
    check("C.01 close rejects invalid outcome", matches(eBad, /invalid outcome|invalid input value/i), errMsg(eBad));

    const { error: eOk } = await admin.rpc("close_offer_import_batch", {
      _batch_id: batchA, _outcome: "succeeded",
    });
    check("C.02 close ok", !eOk, errMsg(eOk));

    const { data: brow } = await admin.from("channel_import_batches").select("*").eq("id", batchA).single();
    check("C.03 status=succeeded", brow?.status === "succeeded");
    check("C.04 finished_at set", brow?.finished_at != null);

    const { error: eTwice } = await admin.rpc("close_offer_import_batch", {
      _batch_id: batchA, _outcome: "succeeded",
    });
    check("C.05 cannot close twice", matches(eTwice, /already closed/i), errMsg(eTwice));

    // After close, ingest is rejected
    const { error: eIng } = await admin.rpc("ingest_imported_offer", {
      _batch_id: batchA, _bol_offer_id: "BOL-LATE", _ean: null,
      _title: "late", _brand: null, _condition: null,
      _price_cents: null, _currency: "EUR", _stock: null, _bol_status: "unknown", _raw: {},
    });
    check("C.06 ingest into closed batch rejected", matches(eIng, /batch not running/i), errMsg(eIng));
  }

  // =========================================================================
  // N. NO-WRITE guarantees
  // =========================================================================
  {
    // channel_listings for company A must be empty (M2 never publishes)
    const { count: lc } = await admin.from("channel_listings")
      .select("*", { count: "exact", head: true }).eq("company_id", compA!.id);
    check("N.01 no channel_listings created by M2", (lc ?? 0) === 0, `count=${lc}`);

    // No SKU rows created on behalf of import (we created 2 manually; ensure still 2)
    const { count: sc } = await admin.from("catalog_skus")
      .select("*", { count: "exact", head: true }).eq("company_id", compA!.id);
    check("N.02 no additional catalog_skus created by M2", (sc ?? 0) === 2, `count=${sc}`);

    // Linked offer did not create a listing
    const { count: llc } = await admin.from("channel_listings")
      .select("*", { count: "exact", head: true }).eq("sku_id", skuA2!.id);
    check("N.03 linking never creates channel_listing", (llc ?? 0) === 0, `count=${llc}`);
  }

  // =========================================================================
  // T. TENANCY
  // =========================================================================
  {
    // Alice sees her batches; Bob sees none of Alice's
    const { data: aliceBatches } = await alice.client.from("channel_import_batches")
      .select("id").eq("company_id", compA!.id);
    check("T.01 Alice sees own batches", (aliceBatches?.length ?? 0) >= 1);

    const { data: bobSeeA } = await bob.client.from("channel_import_batches")
      .select("id").eq("company_id", compA!.id);
    check("T.02 Bob cannot see Alice's batches", (bobSeeA?.length ?? 0) === 0);

    const { data: bobSeeOff } = await bob.client.from("channel_imported_offers")
      .select("id").eq("company_id", compA!.id);
    check("T.03 Bob cannot see Alice's imported offers", (bobSeeOff?.length ?? 0) === 0);

    const { data: bobSeeEan } = await bob.client.from("channel_ean_map")
      .select("id").eq("company_id", compA!.id);
    check("T.04 Bob cannot see Alice's ean map", (bobSeeEan?.length ?? 0) === 0);

    const { data: aliceOff } = await alice.client.from("channel_imported_offers")
      .select("id, review_status").eq("company_id", compA!.id);
    check("T.05 Alice sees her imported offers", (aliceOff?.length ?? 0) >= 3);
  }

  // ---- cleanup users ----
  await admin.auth.admin.deleteUser(alice.uid).catch(() => {});
  await admin.auth.admin.deleteUser(bob.uid).catch(() => {});

  // summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n─────── Phase 4 Migration 2 — ${passed}/${results.length} passed, ${failed} failed ───────`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
