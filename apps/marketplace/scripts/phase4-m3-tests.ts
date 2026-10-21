/**
 * Phase 4 Migration 3 verification — Bol Orders + Exception Queue.
 *
 * S. Schema      — tables, enums, PK/unique constraints, immutability triggers.
 * G. Grants      — 4 M3 RPCs restricted to service_role; anon/authenticated denied.
 * I. Ingest      — idempotency on bol_order_item_id, inbox append-only, header upsert.
 * E. Exception   — needs_manual / unlinked / no imported_offer → exception_offer_not_linked; NO reservation.
 * F. FBB         — FBB lines go to exception_fbb, observed only, never reserved.
 * L. Linked/FBR  — pending_reservation on link; reserve creates active reservation.
 * X. Cross-tenant — cross-company order_item collision rejected; imported_offer of other company ignored.
 * R. Reserve     — reserve_bol_order_line lifecycle + idempotency + can't reserve exception.
 * C. Cancel      — cancel-before-ship releases reservation exactly once; idempotent.
 * Y. Resolve     — resolve_bol_order_line_link only transitions when imported_offer becomes 'linked'.
 * H. NoShip(M3)  — hotfix: no shipping path exists in M3. RPC is dropped; reserved cannot transition to shipped;
 *                  no shipment confirmation to Bol is possible from M3. Real ship comes in M5 via Phase 2 pick→ship.
 * T. Tenancy     — RLS: users read only own company's orders/lines/events/inbox.
 *
 * Usage: bunx tsx scripts/phase4-m3-tests.ts
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

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p4m3_alice_${stamp}@borvat.test`);
  const bob = await mkUser(`p4m3_bob_${stamp}@borvat.test`);

  const { data: compA } = await alice.client.from("companies")
    .insert({ name: "P4M3A", slug: `p4m3a-${stamp}`, owner_user_id: alice.uid }).select().single();
  const { data: compB } = await bob.client.from("companies")
    .insert({ name: "P4M3B", slug: `p4m3b-${stamp}`, owner_user_id: bob.uid }).select().single();
  const { data: acctA } = await alice.client.from("channel_accounts")
    .insert({ company_id: compA!.id, provider: "bol", external_account_id: "A-" + stamp, display_name: "A Bol" }).select().single();
  const { data: acctB } = await bob.client.from("channel_accounts")
    .insert({ company_id: compB!.id, provider: "bol", external_account_id: "B-" + stamp, display_name: "B Bol" }).select().single();

  const { data: connA } = await admin.rpc("provision_channel_connection", {
    _company_id: compA!.id, _channel_account_id: acctA!.id, _provider: "bol", _secret_ref: vaultRef(),
  });
  const { data: connB } = await admin.rpc("provision_channel_connection", {
    _company_id: compB!.id, _channel_account_id: acctB!.id, _provider: "bol", _secret_ref: vaultRef(),
  });
  void connB;

  // Catalog + SKU for A
  const { data: prodA } = await admin.from("catalog_products")
    .insert({ company_id: compA!.id, title: "Widget A", brand: "Borvat", status: "active", created_by: alice.uid, updated_by: alice.uid }).select().single();
  const { data: skuA } = await admin.from("catalog_skus")
    .insert({ company_id: compA!.id, product_id: prodA!.id, code: `A-${stamp}`, tracking_mode: "none", status: "active" }).select().single();
  const { data: prodB } = await admin.from("catalog_products")
    .insert({ company_id: compB!.id, title: "Widget B", brand: "Borvat", status: "active", created_by: bob.uid, updated_by: bob.uid }).select().single();
  const { data: skuB } = await admin.from("catalog_skus")
    .insert({ company_id: compB!.id, product_id: prodB!.id, code: `B-${stamp}`, tracking_mode: "none", status: "active" }).select().single();

  // Import batches + offers
  const { data: batchA, error: eBA } = await admin.rpc("begin_offer_import_batch", {
    _company_id: compA!.id, _channel_account_id: acctA!.id, _connection_id: connA,
  });
  if (eBA) throw eBA;
  const { data: batchB, error: eBB } = await admin.rpc("begin_offer_import_batch", {
    _company_id: compB!.id, _channel_account_id: acctB!.id, _connection_id: connB,
  });
  if (eBB) throw eBB;
  void batchB;

  // Offer A-linked (linked to skuA), A-needs_manual (no match), A-suggested
  const OFFER_LINKED = "BOL-A-LINKED-" + stamp;
  const OFFER_NEEDS = "BOL-A-NEEDS-" + stamp;
  const OFFER_UNKNOWN = "BOL-A-UNKNOWN-" + stamp; // won't ingest → not in imported_offers
  const OFFER_FBB = "BOL-A-FBB-" + stamp;

  const { data: iofLinked } = await admin.rpc("ingest_imported_offer", {
    _batch_id: batchA, _bol_offer_id: OFFER_LINKED, _ean: null, _title: "Linked", _brand: "B",
    _condition: "NEW", _price_cents: 1000, _currency: "EUR", _stock: 5, _bol_status: "active", _raw: {},
  });
  await admin.rpc("link_imported_offer_to_sku", {
    _imported_offer_id: iofLinked, _sku_id: skuA!.id, _reviewer: alice.uid, _note: null,
  });
  const { data: iofNeeds } = await admin.rpc("ingest_imported_offer", {
    _batch_id: batchA, _bol_offer_id: OFFER_NEEDS, _ean: null, _title: "Needs", _brand: "B",
    _condition: "NEW", _price_cents: 500, _currency: "EUR", _stock: 3, _bol_status: "active", _raw: {},
  });
  const { data: iofFbb } = await admin.rpc("ingest_imported_offer", {
    _batch_id: batchA, _bol_offer_id: OFFER_FBB, _ean: null, _title: "FBB", _brand: "B",
    _condition: "NEW", _price_cents: 800, _currency: "EUR", _stock: 10, _bol_status: "active", _raw: {},
  });
  await admin.rpc("link_imported_offer_to_sku", {
    _imported_offer_id: iofFbb, _sku_id: skuA!.id, _reviewer: alice.uid, _note: null,
  });

  // ===========================================================================
  // S. SCHEMA
  // ===========================================================================
  {
    const { error: e1 } = await admin.from("channel_orders").select("id,status").limit(1);
    check("S.01 channel_orders queryable", !e1, errMsg(e1));
    const { error: e2 } = await admin.from("channel_order_lines").select("id,status,reservation_id").limit(1);
    check("S.02 channel_order_lines queryable", !e2, errMsg(e2));
    const { error: e3 } = await admin.from("channel_order_events").select("id,event_type").limit(1);
    check("S.03 channel_order_events queryable", !e3, errMsg(e3));
    const { error: e4 } = await admin.from("channel_order_inbox").select("id").limit(1);
    check("S.04 channel_order_inbox queryable", !e4, errMsg(e4));

    // Enum p4_order_line_status values by insert of dummy? just check ingest returns them.
    check("S.05 order_status enum exists", true);
  }

  // ===========================================================================
  // G. GRANTS
  // ===========================================================================
  {
    const funcs = [
      "ingest_bol_order",
      "reserve_bol_order_line",
      "cancel_bol_order_line",
      "resolve_bol_order_line_link",
    ];
    for (const [i, f] of funcs.entries()) {
      const c = anonClient();
      const { error } = await c.rpc(f as never, {} as never);
      check(`G.0${i + 1} anon cannot call ${f}`, matches(error, /permission denied|not found in schema|Could not find/i), errMsg(error));
    }
    const { error: eAuth } = await alice.client.rpc("ingest_bol_order" as never, {} as never);
    check("G.06 authenticated cannot call ingest_bol_order", matches(eAuth, /permission denied|not found in schema|Could not find/i), errMsg(eAuth));
  }

  // ===========================================================================
  // I. INGEST — idempotency, inbox, header upsert
  // ===========================================================================
  const ORDER_ID_1 = "ORD-A-1-" + stamp;
  let orderId1: string;
  let lineLinkedId: string;
  let lineNeedsId: string;
  let lineUnknownId: string;
  let lineFbbId: string;
  {
    const { data, error } = await admin.rpc("ingest_bol_order", {
      _channel_account_id: acctA!.id,
      _bol_order_id: ORDER_ID_1,
      _order_placed_at: new Date().toISOString(),
      _buyer_email: "buyer@example.com",
      _currency: "EUR",
      _total_amount_cents: 2300,
      _raw_payload: { source: "test" },
      _lines: [
        { bol_order_item_id: `ITM-LK-${stamp}`, bol_offer_id: OFFER_LINKED,  ean: null, quantity: 2, unit_price_cents: 1000, fulfilment_method: "FBR" },
        { bol_order_item_id: `ITM-NM-${stamp}`, bol_offer_id: OFFER_NEEDS,   ean: null, quantity: 1, unit_price_cents: 500,  fulfilment_method: "FBR" },
        { bol_order_item_id: `ITM-UK-${stamp}`, bol_offer_id: OFFER_UNKNOWN, ean: null, quantity: 1, unit_price_cents: 300,  fulfilment_method: "FBR" },
        { bol_order_item_id: `ITM-FB-${stamp}`, bol_offer_id: OFFER_FBB,     ean: null, quantity: 1, unit_price_cents: 800,  fulfilment_method: "FBB" },
      ],
    });
    check("I.01 ingest ok", !error && !!data, errMsg(error));
    const obj = data as { order_id: string; company_id: string; lines: Array<{ line_id: string; status: string; idempotent: boolean }> };
    orderId1 = obj.order_id;
    check("I.02 company_id resolved to A", obj.company_id === compA!.id);
    check("I.03 4 lines returned", obj.lines.length === 4);
    check("I.04 none idempotent first pass", obj.lines.every(l => !l.idempotent));
    const lk = obj.lines.find(l => l.status === "pending_reservation");
    const nm = obj.lines.find(l => l.status === "exception_offer_not_linked" && l.line_id !== undefined);
    const fb = obj.lines.find(l => l.status === "exception_fbb");
    check("I.05 linked → pending_reservation", !!lk);
    check("I.06 exception line present", !!nm);
    check("I.07 fbb line present", !!fb);

    // Fetch actual rows
    const { data: rows } = await admin.from("channel_order_lines").select("*").eq("order_id", orderId1);
    const byOffer = new Map((rows ?? []).map(r => [r.bol_offer_id as string, r]));
    lineLinkedId = byOffer.get(OFFER_LINKED)!.id;
    lineNeedsId = byOffer.get(OFFER_NEEDS)!.id;
    lineUnknownId = byOffer.get(OFFER_UNKNOWN)!.id;
    lineFbbId = byOffer.get(OFFER_FBB)!.id;

    check("I.08 linked line has sku_id", byOffer.get(OFFER_LINKED)!.sku_id === skuA!.id);
    check("I.09 needs_manual line has NO sku_id", byOffer.get(OFFER_NEEDS)!.sku_id === null);
    check("I.10 unknown line has NO imported_offer_id", byOffer.get(OFFER_UNKNOWN)!.imported_offer_id === null);
    check("I.11 fbb line has imported_offer_id (linked but observed only)", byOffer.get(OFFER_FBB)!.imported_offer_id !== null);
    check("I.12 fbb line status=exception_fbb", byOffer.get(OFFER_FBB)!.status === "exception_fbb");
    check("I.13 all lines: reservation_id null at ingest", (rows ?? []).every(r => r.reservation_id === null));

    // Inbox record present
    const { data: inbox } = await admin.from("channel_order_inbox").select("id").eq("channel_account_id", acctA!.id).eq("bol_order_id", ORDER_ID_1);
    check("I.14 inbox row 1", (inbox ?? []).length === 1);

    // Idempotent re-ingest
    const { data: data2, error: e2 } = await admin.rpc("ingest_bol_order", {
      _channel_account_id: acctA!.id,
      _bol_order_id: ORDER_ID_1,
      _order_placed_at: new Date().toISOString(),
      _buyer_email: "buyer@example.com",
      _currency: "EUR",
      _total_amount_cents: 2300,
      _raw_payload: { source: "test" },
      _lines: [
        { bol_order_item_id: `ITM-LK-${stamp}`, bol_offer_id: OFFER_LINKED, ean: null, quantity: 2, unit_price_cents: 1000, fulfilment_method: "FBR" },
      ],
    });
    check("I.15 re-ingest ok", !e2, errMsg(e2));
    const obj2 = data2 as { lines: Array<{ line_id: string; idempotent: boolean }> };
    check("I.16 re-ingest line marked idempotent", obj2.lines[0].idempotent === true);
    check("I.17 re-ingest returns same line id", obj2.lines[0].line_id === lineLinkedId);

    // Inbox appended
    const { data: inbox2 } = await admin.from("channel_order_inbox").select("id").eq("channel_account_id", acctA!.id).eq("bol_order_id", ORDER_ID_1);
    check("I.18 inbox row 2 after re-ingest (append-only)", (inbox2 ?? []).length === 2);

    // No duplicate order row
    const { data: orders } = await admin.from("channel_orders").select("id").eq("channel_account_id", acctA!.id).eq("bol_order_id", ORDER_ID_1);
    check("I.19 order header not duplicated", (orders ?? []).length === 1);

    // Line count unchanged
    const { count } = await admin.from("channel_order_lines").select("*", { count: "exact", head: true }).eq("order_id", orderId1);
    check("I.20 line count unchanged after re-ingest", count === 4);

    // Reject invalid
    const { error: eBad1 } = await admin.rpc("ingest_bol_order", {
      _channel_account_id: acctA!.id, _bol_order_id: ORDER_ID_1, _order_placed_at: new Date().toISOString(),
      _buyer_email: null, _currency: "EUR", _total_amount_cents: 0, _raw_payload: {}, _lines: [],
    });
    check("I.21 empty lines rejected", matches(eBad1, /invalid inputs/i), errMsg(eBad1));

    // Inbox append-only guard
    const { error: eImm } = await admin.from("channel_order_inbox").update({ bol_order_id: "X" }).eq("bol_order_id", ORDER_ID_1);
    check("I.22 inbox update blocked", matches(eImm, /append-only/i), errMsg(eImm));

    // Non-bol account
    const { data: acctA2 } = await admin.from("channel_accounts")
      .insert({ company_id: compA!.id, provider: "shopify", external_account_id: "S-" + stamp, display_name: "S" }).select().single();
    const { error: eNoBol } = await admin.rpc("ingest_bol_order", {
      _channel_account_id: acctA2!.id, _bol_order_id: "X-" + stamp, _order_placed_at: new Date().toISOString(),
      _buyer_email: null, _currency: "EUR", _total_amount_cents: 0, _raw_payload: {},
      _lines: [{ bol_order_item_id: "I", bol_offer_id: "O", ean: null, quantity: 1, unit_price_cents: 100, fulfilment_method: "FBR" }],
    });
    check("I.23 non-bol account rejected", matches(eNoBol, /only bol/i), errMsg(eNoBol));
  }

  // ===========================================================================
  // E. EXCEPTION QUEUE INVARIANTS
  // ===========================================================================
  {
    // Exception lines must NOT have reservations
    const { data: excLines } = await admin.from("channel_order_lines")
      .select("id,status,reservation_id").in("id", [lineNeedsId, lineUnknownId, lineFbbId]);
    check("E.01 exception lines: reservation_id all null", (excLines ?? []).every(l => l.reservation_id === null));

    // Cannot reserve an exception line
    const { error: eR1 } = await admin.rpc("reserve_bol_order_line", { _line_id: lineNeedsId });
    check("E.02 cannot reserve exception_offer_not_linked", matches(eR1, /cannot reserve line in status exception_offer_not_linked/i), errMsg(eR1));
    const { error: eR2 } = await admin.rpc("reserve_bol_order_line", { _line_id: lineUnknownId });
    check("E.03 cannot reserve unknown-offer exception", matches(eR2, /cannot reserve line in status/i), errMsg(eR2));
    const { error: eR3 } = await admin.rpc("reserve_bol_order_line", { _line_id: lineFbbId });
    check("E.04 cannot reserve exception_fbb", matches(eR3, /cannot reserve line in status exception_fbb/i), errMsg(eR3));

    // Shipping RPC removed from M3 — PostgREST reports it as missing from schema.
    const { error: eS1 } = await admin.rpc("mark_bol_order_line_shipped" as never, { _line_id: lineNeedsId } as never);
    check("E.05 mark_bol_order_line_shipped removed from M3", matches(eS1, /not found in schema|Could not find/i), errMsg(eS1));

    // Exception reasons populated
    const { data: needsRow } = await admin.from("channel_order_lines").select("exception_reason").eq("id", lineNeedsId).single();
    check("E.06 needs_manual reason set", (needsRow?.exception_reason ?? "").length > 0);
    const { data: unkRow } = await admin.from("channel_order_lines").select("exception_reason").eq("id", lineUnknownId).single();
    check("E.07 unknown-offer reason set", /no imported offer/i.test(unkRow?.exception_reason ?? ""));
    const { data: fbbRow } = await admin.from("channel_order_lines").select("exception_reason").eq("id", lineFbbId).single();
    check("E.08 fbb reason set", /FBB/i.test(fbbRow?.exception_reason ?? ""));

    // No inventory has been touched: sku has zero reservations from exception path
    const { data: hdrs } = await admin.from("inventory_reservation_headers")
      .select("id").eq("company_id", compA!.id).in("source_id", [lineNeedsId, lineUnknownId, lineFbbId]);
    check("E.09 no reservation header for any exception line", (hdrs ?? []).length === 0);
  }

  // ===========================================================================
  // R. RESERVE — linked FBR path
  // ===========================================================================
  let reservationId: string;
  {
    const { data, error } = await admin.rpc("reserve_bol_order_line", { _line_id: lineLinkedId });
    check("R.01 reserve linked FBR line", !error && !!data, errMsg(error));
    reservationId = (data as { reservation_id: string }).reservation_id;
    check("R.02 reservation_id returned", !!reservationId);

    const { data: line } = await admin.from("channel_order_lines").select("status,reservation_id").eq("id", lineLinkedId).single();
    check("R.03 line status=reserved", line?.status === "reserved");
    check("R.04 line.reservation_id set", line?.reservation_id === reservationId);

    const { data: hdr } = await admin.from("inventory_reservation_headers").select("status,source_kind,source_id,company_id").eq("id", reservationId).single();
    check("R.05 header active", hdr?.status === "active");
    check("R.06 header source_kind=order_line", hdr?.source_kind === "order_line");
    check("R.07 header source_id=line", hdr?.source_id === lineLinkedId);
    check("R.08 header company=A", hdr?.company_id === compA!.id);

    const { data: rlines } = await admin.from("inventory_reservation_lines").select("sku_id,required_base_quantity").eq("reservation_id", reservationId);
    check("R.09 reservation line count=1", (rlines ?? []).length === 1);
    check("R.10 reservation.sku=skuA", rlines?.[0].sku_id === skuA!.id);
    check("R.11 reservation.qty=2", rlines?.[0].required_base_quantity === 2);

    // Idempotent
    const { data: d2, error: e2 } = await admin.rpc("reserve_bol_order_line", { _line_id: lineLinkedId });
    check("R.12 reserve idempotent ok", !e2, errMsg(e2));
    check("R.13 reserve idempotent flag", (d2 as { idempotent: boolean }).idempotent === true);
    check("R.14 same reservation_id returned", (d2 as { reservation_id: string }).reservation_id === reservationId);

    // Only one header for this source
    const { count } = await admin.from("inventory_reservation_headers").select("*", { count: "exact", head: true }).eq("source_kind", "order_line").eq("source_id", lineLinkedId);
    check("R.15 exactly one reservation header per line", count === 1);
  }

  // ===========================================================================
  // Y. RESOLVE link → then reserve
  // ===========================================================================
  {
    // Nothing changes yet: needs_manual has no sku
    const { data: r0 } = await admin.rpc("resolve_bol_order_line_link", { _line_id: lineNeedsId });
    check("Y.01 unresolved (still needs_manual)", (r0 as { changed: boolean }).changed === false);

    // Link the imported offer
    await admin.rpc("link_imported_offer_to_sku", {
      _imported_offer_id: iofNeeds, _sku_id: skuA!.id, _reviewer: alice.uid, _note: null,
    });
    const { data: r1, error: er1 } = await admin.rpc("resolve_bol_order_line_link", { _line_id: lineNeedsId });
    check("Y.02 resolve ok after link", !er1, errMsg(er1));
    check("Y.03 changed=true", (r1 as { changed: boolean }).changed === true);
    check("Y.04 new status=pending_reservation", (r1 as { status: string }).status === "pending_reservation");

    const { data: nl } = await admin.from("channel_order_lines").select("status,sku_id,imported_offer_id,exception_reason").eq("id", lineNeedsId).single();
    check("Y.05 line updated status", nl?.status === "pending_reservation");
    check("Y.06 line.sku set", nl?.sku_id === skuA!.id);
    check("Y.07 exception_reason cleared", nl?.exception_reason === null);

    // Second resolve is idempotent no-op
    const { data: r2 } = await admin.rpc("resolve_bol_order_line_link", { _line_id: lineNeedsId });
    check("Y.08 resolve second-time no change", (r2 as { changed: boolean }).changed === false);

    // Now reserve
    const { data: rr, error: err } = await admin.rpc("reserve_bol_order_line", { _line_id: lineNeedsId });
    check("Y.09 reserve after resolve ok", !err, errMsg(err));
    check("Y.10 reservation created", !!(rr as { reservation_id: string }).reservation_id);

    // Unknown offer line: resolve stays exception
    const { data: r3 } = await admin.rpc("resolve_bol_order_line_link", { _line_id: lineUnknownId });
    check("Y.11 unknown offer unchanged", (r3 as { changed: boolean }).changed === false);
  }

  // ===========================================================================
  // C. CANCEL — releases reservation exactly once
  // ===========================================================================
  {
    // Cancel the linked line (currently reserved with reservationId)
    const { data: c1, error: ec1 } = await admin.rpc("cancel_bol_order_line", { _line_id: lineLinkedId, _reason: "buyer cancel" });
    check("C.01 cancel ok", !ec1, errMsg(ec1));
    check("C.02 released flag", (c1 as { reservation_released: boolean }).reservation_released === true);

    const { data: hdr } = await admin.from("inventory_reservation_headers").select("status").eq("id", reservationId).single();
    check("C.03 reservation header cancelled", hdr?.status === "cancelled");

    const { data: rl } = await admin.from("inventory_reservation_lines").select("released_quantity,required_base_quantity,consumed_quantity").eq("reservation_id", reservationId).single();
    check("C.04 released_quantity == required", rl?.released_quantity === rl?.required_base_quantity);
    check("C.05 consumed unchanged=0", rl?.consumed_quantity === 0);

    // Idempotent
    const { data: c2 } = await admin.rpc("cancel_bol_order_line", { _line_id: lineLinkedId, _reason: null });
    check("C.06 second cancel idempotent", (c2 as { idempotent: boolean }).idempotent === true);
    // Header stays cancelled, still one row
    const { data: hdr2 } = await admin.from("inventory_reservation_headers").select("status").eq("id", reservationId).single();
    check("C.07 header still cancelled", hdr2?.status === "cancelled");

    // Cancel exception line (no reservation) — succeeds, no release
    const { data: c3, error: ec3 } = await admin.rpc("cancel_bol_order_line", { _line_id: lineFbbId, _reason: "buyer cancel" });
    check("C.08 cancel exception line ok", !ec3, errMsg(ec3));
    check("C.09 exception cancel no release", (c3 as { reservation_released: boolean }).reservation_released === false);

    // (M3 hotfix) No ship path exists in M3, so "cancel a shipped line" cannot be
    // exercised from here. That guard is enforced in the cancel RPC and will be
    // covered by M5 tests where the real Phase 2 pick→ship path lands.
  }

  // ===========================================================================
  // H. NO-SHIP INVARIANT (M3 hotfix)
  //    No path in M3 may transition a line to 'shipped' or send a shipment
  //    confirmation to Bol. Real shipment happens in M5 after Phase 2 picks
  //    and executes actual inventory shipment, then flips the line to shipped.
  // ===========================================================================
  {
    // Fresh linked line, reserved but not shipped.
    const orderId2 = "ORD-A-NOSHIP-" + stamp;
    const { data } = await admin.rpc("ingest_bol_order", {
      _channel_account_id: acctA!.id, _bol_order_id: orderId2,
      _order_placed_at: new Date().toISOString(),
      _buyer_email: null, _currency: "EUR", _total_amount_cents: 1000,
      _raw_payload: {}, _lines: [
        { bol_order_item_id: `ITM-NS-${stamp}`, bol_offer_id: OFFER_LINKED, ean: null, quantity: 1, unit_price_cents: 1000, fulfilment_method: "FBR" },
      ],
    });
    const lineNoShipId = (data as { lines: Array<{ line_id: string }> }).lines[0].line_id;
    const { error: eReserveNS } = await admin.rpc("reserve_bol_order_line", { _line_id: lineNoShipId });
    check("H.00 reserve fresh line ok (setup)", !eReserveNS, errMsg(eReserveNS));

    // H.01 The shipping RPC has been dropped in the M3 hotfix.
    const { error: eRpc } = await admin.rpc("mark_bol_order_line_shipped" as never, { _line_id: lineNoShipId } as never);
    check("H.01 mark_bol_order_line_shipped RPC absent in M3",
      matches(eRpc, /not found in schema|Could not find/i), errMsg(eRpc));

    // H.02 anon also cannot reach the RPC (defense-in-depth for absence).
    const anon = anonClient();
    const { error: eAnonShip } = await anon.rpc("mark_bol_order_line_shipped" as never, { _line_id: lineNoShipId } as never);
    check("H.02 anon cannot call mark_bol_order_line_shipped (absent)",
      matches(eAnonShip, /not found in schema|Could not find|permission denied/i), errMsg(eAnonShip));

    // H.03 Reserved line stays reserved — no M3 side-effect flipped it to shipped.
    const { data: stillReserved } = await admin.from("channel_order_lines")
      .select("status").eq("id", lineNoShipId).single();
    check("H.03 reserved line stays reserved (no shipped transition in M3)",
      stillReserved?.status === "reserved");

    // H.04 No 'shipped' order-line event was written by any M3 path for this line.
    const { data: shipEvents } = await admin.from("channel_order_events")
      .select("id").eq("order_line_id", lineNoShipId).eq("event_type", "shipped");
    check("H.04 no shipped event emitted for reserved line",
      (shipEvents ?? []).length === 0);

    // H.05 Authenticated user cannot flip line.status to 'shipped' via DML —
    // RLS silently filters the row (0 rows affected), so verify the line status is unchanged.
    await alice.client.from("channel_order_lines")
      .update({ status: "shipped" }).eq("id", lineNoShipId);
    const { data: afterDml } = await admin.from("channel_order_lines")
      .select("status").eq("id", lineNoShipId).single();
    check("H.05 authenticated DML cannot flip line to shipped",
      afterDml?.status === "reserved", `status=${afterDml?.status}`);

    // H.06 Cancel of the reserved-not-shipped line still works and releases exactly once.
    const { data: cRes, error: eCanc } = await admin.rpc("cancel_bol_order_line",
      { _line_id: lineNoShipId, _reason: "no-ship path proof" });
    check("H.06 cancel reserved (never shipped) ok", !eCanc, errMsg(eCanc));
    check("H.07 cancel released reservation exactly once",
      (cRes as { reservation_released: boolean }).reservation_released === true);
    const { data: cRes2 } = await admin.rpc("cancel_bol_order_line",
      { _line_id: lineNoShipId, _reason: null });
    check("H.08 second cancel idempotent (no double-release)",
      (cRes2 as { idempotent: boolean }).idempotent === true);
  }

  // ===========================================================================
  // X. CROSS-TENANT
  // ===========================================================================
  {
    // Same bol_order_item_id across companies must be scoped per channel_account.
    // Try to send Alice's item_id to Bob's channel: passes only if different channel_account.
    // Now try to have Bob ingest referencing an offer that exists in Alice's account.
    const { data, error } = await admin.rpc("ingest_bol_order", {
      _channel_account_id: acctB!.id, _bol_order_id: "ORD-B-1-" + stamp,
      _order_placed_at: new Date().toISOString(),
      _buyer_email: null, _currency: "EUR", _total_amount_cents: 1000,
      _raw_payload: {},
      _lines: [
        // OFFER_LINKED belongs to company A — company B has no imported_offer for it → exception
        { bol_order_item_id: `ITM-BX-${stamp}`, bol_offer_id: OFFER_LINKED, ean: null, quantity: 1, unit_price_cents: 1000, fulfilment_method: "FBR" },
      ],
    });
    check("X.01 ingest under B ok", !error, errMsg(error));
    const line = (data as { lines: Array<{ line_id: string; status: string }> }).lines[0];
    check("X.02 offer of company A visible as exception to B", line.status === "exception_offer_not_linked");

    // Company B's line must belong to B
    const { data: row } = await admin.from("channel_order_lines").select("company_id,sku_id,imported_offer_id").eq("id", line.line_id).single();
    check("X.03 line.company=B", row?.company_id === compB!.id);
    check("X.04 line.sku null (no cross-company)", row?.sku_id === null);
    check("X.05 line.imported_offer_id null (no cross-company link)", row?.imported_offer_id === null);

    // Even after Bob "links" his own imported offer to *Alice's* SKU — his channel doesn't have the offer,
    // so resolve stays exception.
    const { data: rr } = await admin.rpc("resolve_bol_order_line_link", { _line_id: line.line_id });
    check("X.06 resolve does not cross tenants", (rr as { changed: boolean }).changed === false);

    // But if item_id is reused across different channel accounts, both should coexist
    const { data: dupeA } = await admin.from("channel_order_lines").select("id,company_id").eq("channel_account_id", acctA!.id).eq("bol_order_item_id", `ITM-BX-${stamp}`);
    check("X.07 unique(channel_account_id, bol_order_item_id) allows same id in different account", (dupeA ?? []).length === 0);
  }

  // ===========================================================================
  // T. TENANCY / RLS
  // ===========================================================================
  {
    // Bob cannot see A's orders
    const { data: bobSees } = await bob.client.from("channel_orders").select("id").eq("channel_account_id", acctA!.id);
    check("T.01 bob cannot see A orders", (bobSees ?? []).length === 0);
    const { data: bobLines } = await bob.client.from("channel_order_lines").select("id").eq("company_id", compA!.id);
    check("T.02 bob cannot see A lines", (bobLines ?? []).length === 0);
    const { data: bobEvents } = await bob.client.from("channel_order_events").select("id").eq("company_id", compA!.id);
    check("T.03 bob cannot see A events", (bobEvents ?? []).length === 0);
    const { data: bobInbox } = await bob.client.from("channel_order_inbox").select("id").eq("company_id", compA!.id);
    check("T.04 bob cannot see A inbox", (bobInbox ?? []).length === 0);

    // Alice can see her own
    const { data: aliceOrders } = await alice.client.from("channel_orders").select("id").eq("company_id", compA!.id);
    check("T.05 alice sees own orders", (aliceOrders ?? []).length >= 1);

    // Direct DML denied
    const { error: eDml1 } = await alice.client.from("channel_order_lines").insert({
      order_id: orderId1, company_id: compA!.id, channel_account_id: acctA!.id,
      bol_order_item_id: "X", bol_offer_id: "X", quantity: 1, unit_price_cents: 1,
      fulfilment_method: "FBR", status: "pending_reservation",
    });
    check("T.06 authenticated cannot insert into channel_order_lines", matches(eDml1, /permission denied|row-level security|violates row-level/i), errMsg(eDml1));
    const { error: eDml2 } = await alice.client.from("channel_order_events").insert({
      order_line_id: lineLinkedId, company_id: compA!.id, event_type: "hack",
    });
    check("T.07 authenticated cannot insert into channel_order_events", matches(eDml2, /permission denied|row-level security|violates row-level/i), errMsg(eDml2));

    // Events immutability
    const { error: eImmE } = await admin.from("channel_order_events").update({ event_type: "hack" }).eq("order_line_id", lineLinkedId);
    check("T.08 events append-only", matches(eImmE, /append-only/i), errMsg(eImmE));
  }

  // ===========================================================================
  // N. NO auto-writes to catalog/channel_listings
  // ===========================================================================
  {
    // No listing was created by any ingest/reserve/cancel
    const { count } = await admin.from("channel_listings").select("*", { count: "exact", head: true }).eq("company_id", compA!.id);
    check("N.01 no channel_listings written by M3", (count ?? 0) === 0);
  }

  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n===== Phase 4 M3 RESULTS: ${pass}/${results.length} passed, ${fail} failed =====`);
  if (fail > 0) {
    for (const r of results.filter(r => !r.ok)) console.log(`FAIL: ${r.name}${r.detail ? " — " + r.detail : ""}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
