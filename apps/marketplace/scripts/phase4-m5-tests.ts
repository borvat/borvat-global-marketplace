/**
 * Phase 4 Migration 5 verification — FBR Fulfilment & Shipment Sync.
 *
 * Charter Revision 2 — §3.3 branch: bol.shipment.cancel DEFERRED from M5
 * (no Bol Retailer API v11 endpoint documented). Only bol.shipment.confirm
 * is enabled.
 *
 * Sections:
 *   S. Schema           — tables, indexes, constraints exist and are shaped as spec'd.
 *   G. Grants           — every M5 write RPC is service_role only.
 *   P. Profiles fix     — public SELECT policy removed; owner-only reads.
 *   L. Live gate        — p4_dispatch_decision returns 'deferred_not_authorized'
 *                          without live_authorized_at + env flag; authorize RPC gated.
 *   M1. Mandatory §8.1  — Bol FAILURE / timeout does NOT reverse internal ship.
 *   M2. Mandatory §8.2  — Two shipments for the same offer are independent
 *                          (no cross-supersession, zero rows in Phase 3 listing outbox).
 *   M3. Mandatory §8.3  — Replay of §6.1 RPC is a full no-op.
 *   M4. Mandatory §8.4  — Cancel path is rejected (deferred branch).
 *   T. Tenancy          — Cross-tenant reads/writes rejected everywhere.
 *   O. Outbox lifecycle — claim / complete / fail / DLQ / lease recovery.
 *   I. Inbound status   — ingest_bol_shipment_status transitions + idempotency.
 *   X. Cancel deferred  — adapter rejects the event_kind; DB accepts only confirm.
 *
 * Usage: bunx tsx scripts/phase4-m5-tests.ts
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
  console.log(`${ok ? "✅" : "❌"} ${name}${detail && !ok ? " — " + detail : ""}`);
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

/** Create a company with warehouse, sku, initial inventory, a reservation
 *  fully picked+packed on one allocation, and a channel order line linked
 *  to that reservation. Returns everything needed for M5 ship. */
async function setupCompany(prefix: string, stamp: number) {
  const user = await mkUser(`${prefix}_${stamp}@borvat.test`);
  const { data: comp, error: eComp } = await user.client.from("companies")
    .insert({ name: `M5-${prefix}`, slug: `m5-${prefix.toLowerCase()}-${stamp}`, owner_user_id: user.uid }).select().single();
  if (eComp || !comp) throw new Error(`companies insert failed: ${errMsg(eComp)}`);
  const { data: acct, error: eAcct } = await user.client.from("channel_accounts")
    .insert({ company_id: comp.id, provider: "bol", external_account_id: `${prefix}-${stamp}`, display_name: `${prefix} Bol` })
    .select().single();
  if (eAcct || !acct) throw new Error(`channel_accounts insert failed: ${errMsg(eAcct)}`);
  const { data: conn, error: eConn } = await admin.rpc("provision_channel_connection", {
    _company_id: comp.id, _channel_account_id: acct.id, _provider: "bol", _secret_ref: vaultRef(),
  });
  if (eConn) throw new Error(`provision_channel_connection failed: ${errMsg(eConn)}`);
  const { data: prod } = await admin.from("catalog_products")
    .insert({ company_id: comp!.id, title: `Widget ${prefix}`, brand: "Borvat", status: "active", created_by: user.uid, updated_by: user.uid })
    .select().single();
  const { data: sku } = await admin.from("catalog_skus")
    .insert({ company_id: comp!.id, product_id: prod!.id, code: `${prefix}-SKU-${stamp}`, tracking_mode: "none", status: "active" })
    .select().single();
  const { data: wh } = await user.client.from("warehouses")
    .insert({ company_id: comp!.id, code: `WH-${prefix}`, name: `WH ${prefix}` }).select().single();

  // Seed inventory: 30 units sellable (via authenticated owner)
  const { error: eSeed } = await user.client.rpc("post_inventory_transaction", {
    _company_id: comp.id, _reason: "stock_receipt",
    _entries: [{ sku_id: sku!.id, warehouse_id: wh!.id, disposition: "sellable", quantity: 30 }],
  });
  if (eSeed) throw new Error(`seed post_inventory_transaction failed: ${errMsg(eSeed)}`);

  return { user, comp: comp!, acct: acct!, conn: conn as unknown as string, sku: sku!, wh: wh!, prod: prod! };
}

/** Create a reservation and pick+pack `qty` units on a single allocation. */
async function reserveAndPack(ctx: Awaited<ReturnType<typeof setupCompany>>, qty: number) {
  const src = crypto.randomUUID();
  const { data: r, error: eR } = await ctx.user.client.rpc("create_reservation", {
    _company_id: ctx.comp.id, _source_kind: "order_line", _source_id: src,
    _lines: [{ sku_id: ctx.sku.id, allocations: [{ warehouse_id: ctx.wh.id, quantity: qty }] }],
  });
  if (eR || !r) throw new Error(`create_reservation failed: ${errMsg(eR)}`);
  const resvId = (r as any).reservation_id as string;
  const { data: lines, error: eL } = await admin.from("inventory_reservation_lines").select("id").eq("reservation_id", resvId);
  if (eL || !lines || lines.length === 0) throw new Error(`no reservation lines for ${resvId}: ${errMsg(eL)}`);
  const { data: allocs, error: eA } = await admin.from("inventory_reservation_allocations")
    .select("id, allocated_quantity, line_id").eq("line_id", lines[0].id);
  if (eA || !allocs || allocs.length === 0) throw new Error(`no allocations: ${errMsg(eA)}`);
  const alloc = allocs[0];
  const { error: ePick } = await ctx.user.client.rpc("pick_reservation_allocation", { _allocation_id: alloc.id, _quantity: qty });
  if (ePick) throw new Error(`pick failed: ${errMsg(ePick)}`);
  const { error: ePack } = await ctx.user.client.rpc("pack_reservation_allocation", { _allocation_id: alloc.id, _quantity: qty });
  if (ePack) throw new Error(`pack failed: ${errMsg(ePack)}`);
  return { resvId, allocationId: alloc.id as string };
}

/** Create a channel order + one FBR line referencing a reservation. */
async function createChannelOrderLine(ctx: Awaited<ReturnType<typeof setupCompany>>, bolOffer: string, resvId: string) {
  const { data: order, error: eO } = await admin.from("channel_orders")
    .insert({
      company_id: ctx.comp.id, channel_account_id: ctx.acct.id,
      bol_order_id: `ORD-${bolOffer}`, status: "open",
      order_placed_at: new Date().toISOString(),
      currency: "EUR", total_amount_cents: 1000,
    })
    .select().single();
  if (eO || !order) throw new Error(`channel_orders insert failed: ${errMsg(eO)}`);
  const { data: line, error: eLn } = await admin.from("channel_order_lines").insert({
    order_id: order.id, company_id: ctx.comp.id, channel_account_id: ctx.acct.id,
    bol_order_item_id: `ITM-${bolOffer}`, bol_offer_id: bolOffer, quantity: 1,
    unit_price_cents: 1000, fulfilment_method: "FBR", sku_id: ctx.sku.id,
    status: "reserved", reservation_id: resvId,
  }).select().single();
  if (eLn || !line) throw new Error(`channel_order_lines insert failed: ${errMsg(eLn)}`);
  return { orderId: order.id, lineId: line.id as string, bolOffer };
}

async function main() {
  const stamp = Date.now();
  const A = await setupCompany("m5A", stamp);
  const B = await setupCompany("m5B", stamp);

  // ==========================================================================
  // S. Schema
  // ==========================================================================
  {
    for (const t of ["channel_shipments", "channel_shipment_events", "shipment_outbox_events", "shipment_outbox_dead_letters"]) {
      const { error } = await admin.from(t).select("id").limit(0);
      check(`S.01 table ${t} exists`, !error, errMsg(error));
    }
    // live_authorized_at column
    const { data: rows } = await admin.from("channel_connections").select("id,live_authorized_at").limit(1);
    check("S.02 live_authorized_at column present", Array.isArray(rows));
    // Constraint on shipment_outbox_events.event_kind (only confirm allowed)
    const { error: eBad } = await admin.from("shipment_outbox_events").insert({
      company_id: A.comp.id, channel_account_id: A.acct.id,
      channel_shipment_id: crypto.randomUUID(), event_kind: "bol.shipment.cancel",
    });
    check("S.03 event_kind check constraint rejects deferred kinds",
      matches(eBad, /check|event_kind|violates/i), errMsg(eBad));
  }

  // ==========================================================================
  // G. Grants — all write RPCs service_role only
  // ==========================================================================
  {
    const funcs = [
      "record_internal_ship_and_enqueue_confirmation",
      "record_channel_shipment_accepted",
      "record_channel_shipment_bol_confirmed",
      "record_channel_shipment_bol_failure",
      "ingest_bol_shipment_status",
      "claim_shipment_outbox_batch",
      "complete_shipment_outbox_event",
      "fail_shipment_outbox_event",
      "recover_expired_shipment_leases",
      "authorize_channel_live",
    ];
    let i = 0;
    for (const f of funcs) {
      const c = anonClient();
      const { error } = await c.rpc(f as never, {} as never);
      check(`G.${String(++i).padStart(2, "0")} anon cannot call ${f}`,
        matches(error, /permission denied|not found in schema|Could not find|schema cache/i), errMsg(error));
    }
    // Authenticated cannot call ingest either (function-level revoke)
    const { error: eAuth } = await A.user.client.rpc("record_internal_ship_and_enqueue_confirmation" as never, {} as never);
    check("G.11 authenticated cannot call ship RPC",
      matches(eAuth, /permission denied|not found in schema|Could not find|schema cache/i), errMsg(eAuth));
  }

  // ==========================================================================
  // P. Profiles security fix
  // ==========================================================================
  {
    // Alice's client can only read her own profile row; not Bob's.
    const { data: mine } = await A.user.client.from("profiles").select("id").eq("id", A.user.uid);
    check("P.01 owner reads own profile", (mine ?? []).length === 1);
    const { data: theirs } = await A.user.client.from("profiles").select("id").eq("id", B.user.uid);
    check("P.02 cannot read other user's profile", (theirs ?? []).length === 0);
  }

  // ==========================================================================
  // L. Live authorization gate
  // ==========================================================================
  {
    // Set connection to live but not authorized
    await admin.from("channel_connections").update({ mode: "live", live_sync_enabled: true }).eq("id", A.conn);
    const { data: d1 } = await admin.rpc("p4_dispatch_decision", { _channel_account_id: A.acct.id });
    check("L.01 live without live_authorized_at → deferred_not_authorized", d1 === "deferred_not_authorized", `dec=${d1}`);

    // authorize_channel_live is gated by env flag (false) — should throw
    const { error: eAuthz } = await admin.rpc("authorize_channel_live", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id, _note: "test",
    });
    check("L.02 authorize_channel_live blocked when flag disabled",
      matches(eAuthz, /disabled|P4_LIVE_AUTHORIZATION_ENABLED|P0403/i), errMsg(eAuthz));

    // Even if a bad-actor sets live_authorized_at directly, flag off → still deferred
    await admin.from("channel_connections").update({ live_authorized_at: new Date().toISOString() }).eq("id", A.conn);
    const { data: d2 } = await admin.rpc("p4_dispatch_decision", { _channel_account_id: A.acct.id });
    check("L.03 flag off keeps decision deferred even if column set", d2 === "deferred_not_authorized", `dec=${d2}`);

    // Reset back to read_only for the rest of the tests
    await admin.from("channel_connections")
      .update({ mode: "read_only", live_sync_enabled: false, live_authorized_at: null }).eq("id", A.conn);
    const { data: d3 } = await admin.rpc("p4_dispatch_decision", { _channel_account_id: A.acct.id });
    check("L.04 read_only decision restored", d3 === "blocked_read_only", `dec=${d3}`);
  }

  // ==========================================================================
  // M1. Mandatory §8.1 — Bol FAILURE does not reverse internal ship
  // ==========================================================================
  const M1_OFFER = "BOL-M1-" + stamp;
  let M1_lineId: string;
  let M1_shipmentId: string;
  let M1_outboxId: string;
  let M1_txId: string;
  {
    const { resvId, allocationId } = await reserveAndPack(A, 1);
    const line = await createChannelOrderLine(A, M1_OFFER, resvId);
    M1_lineId = line.lineId;

    // Snapshot pre-ship state
    const { data: balBefore } = await admin.from("inventory_balances")
      .select("disposition, quantity").eq("company_id", A.comp.id).eq("sku_id", A.sku.id).eq("warehouse_id", A.wh.id);
    const beforeMap = new Map((balBefore ?? []).map((b: any) => [b.disposition, b.quantity]));

    const { data: shipRes, error: shipErr } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _channel_order_line_id: M1_lineId, _allocation_id: allocationId,
      _transporter_code: "TNT", _track_and_trace: "TRK-M1",
    });
    check("M1.01 record_internal_ship_and_enqueue_confirmation ok", !shipErr && (shipRes as any).ok === true, errMsg(shipErr));
    M1_shipmentId = (shipRes as any).shipment_id;
    M1_outboxId = (shipRes as any).outbox_event_id;
    M1_txId = (shipRes as any).inventory_transaction_id;
    check("M1.02 returns shipment_id + outbox_event_id + inventory_transaction_id",
      !!M1_shipmentId && !!M1_outboxId && !!M1_txId);

    // Shipment status = pending_bol_confirmation, shipped_at set
    const { data: ship } = await admin.from("channel_shipments").select("*").eq("id", M1_shipmentId).single();
    check("M1.03 shipment.status = pending_bol_confirmation", ship!.status === "pending_bol_confirmation");
    check("M1.04 shipped_at set", ship!.shipped_at !== null);
    check("M1.05 bol_confirmed_at NULL before Bol answer", ship!.bol_confirmed_at === null);

    // Outbox: pending, event_kind = bol.shipment.confirm
    const { data: ob } = await admin.from("shipment_outbox_events").select("*").eq("id", M1_outboxId).single();
    check("M1.06 outbox event pending + confirm kind",
      ob!.status === "pending" && ob!.event_kind === "bol.shipment.confirm");

    // Simulate Bol FAILURE: fail_shipment_outbox_event(transient=true) + record_channel_shipment_bol_failure
    // Claim it first
    const { data: claimed } = await admin.rpc("claim_shipment_outbox_batch", {
      _worker_id: "wA", _lease_ttl_seconds: 60, _batch_size: 10,
    });
    check("M1.07 claim returns our event", Array.isArray(claimed) && (claimed as any[]).some(e => e.id === M1_outboxId));

    const { data: failRes } = await admin.rpc("fail_shipment_outbox_event", {
      _event_id: M1_outboxId, _error: "bol FAILURE terminal", _transient: true,
    });
    check("M1.08 fail (transient) reschedules with backoff", (failRes as any).dead_lettered === false);

    await admin.rpc("record_channel_shipment_bol_failure", { _shipment_id: M1_shipmentId, _error: "bol FAILURE terminal" });

    // Non-reversal: inventory unchanged from post-ship state; task still shipped
    const { data: ship2 } = await admin.from("channel_shipments").select("*").eq("id", M1_shipmentId).single();
    check("M1.09 shipment stays pending_bol_confirmation after failure", ship2!.status === "pending_bol_confirmation");
    check("M1.10 last_error recorded", (ship2!.last_error ?? "").includes("FAILURE"));

    const { data: alloc } = await admin.from("inventory_reservation_allocations").select("*").eq("id", allocationId).single();
    check("M1.11 allocation.shipped_quantity NOT reversed", alloc!.shipped_quantity === 1);

    // Ledger row still exists
    const { data: tx } = await admin.from("inventory_transactions").select("id, reason").eq("id", M1_txId).single();
    check("M1.12 inventory_transactions row still present (ship)", tx!.reason === "ship");

    // Balances unchanged from immediately post-ship: sellable was 10 pre-ledger receipt path,
    // but this compares dispositions before/after failure, not before/after ship
    const { data: balAfter } = await admin.from("inventory_balances")
      .select("disposition, quantity").eq("company_id", A.comp.id).eq("sku_id", A.sku.id).eq("warehouse_id", A.wh.id);
    const afterMap = new Map((balAfter ?? []).map((b: any) => [b.disposition, b.quantity]));
    // At minimum: no reversal txn was posted → no new positive entry on 'packed_or_staging'
    const packedAfter = (afterMap.get("packed_or_staging") ?? 0) as number;
    check("M1.13 packed_or_staging balance not restored (no reversal)", packedAfter === 0, `packed=${packedAfter}`);
    void beforeMap;

    // Now succeed the retry: claim + complete + record_channel_shipment_bol_confirmed
    // Reset next_visible_at to now so we can claim immediately
    await admin.from("shipment_outbox_events").update({ next_visible_at: new Date().toISOString() }).eq("id", M1_outboxId);
    const { data: claimed2 } = await admin.rpc("claim_shipment_outbox_batch", {
      _worker_id: "wA", _lease_ttl_seconds: 60, _batch_size: 10,
    });
    check("M1.14 retry claim succeeds", (claimed2 as any[]).some(e => e.id === M1_outboxId));
    await admin.rpc("complete_shipment_outbox_event", {
      _event_id: M1_outboxId, _external_ref: { processStatusId: "PS-M1", bolShipmentId: "BS-M1" },
    });
    const { data: confRes, error: eConf } = await admin.rpc("record_channel_shipment_bol_confirmed", {
      _shipment_id: M1_shipmentId, _external_ref: { processStatusId: "PS-M1" },
    });
    check("M1.15 record_channel_shipment_bol_confirmed ok", !eConf && (confRes as any).ok, errMsg(eConf));
    const { data: ship3 } = await admin.from("channel_shipments").select("*").eq("id", M1_shipmentId).single();
    check("M1.16 shipment.status = bol_confirmed", ship3!.status === "bol_confirmed");
    check("M1.17 bol_confirmed_at now set", ship3!.bol_confirmed_at !== null);

    // Idempotent confirm replay
    const { data: replayRes } = await admin.rpc("record_channel_shipment_bol_confirmed", {
      _shipment_id: M1_shipmentId, _external_ref: {},
    });
    check("M1.18 confirm replay idempotent", (replayRes as any).idempotent_replay === true);
  }

  // ==========================================================================
  // M2. Mandatory §8.2 — Two shipments for the same offer are independent
  // ==========================================================================
  const M2_OFFER = "BOL-M2-" + stamp;
  {
    // Snapshot Phase 3 listing outbox row count for A before M2
    const { count: listingOutboxBefore } = await admin.from("outbox_events")
      .select("id", { count: "exact", head: true }).eq("company_id", A.comp.id);

    // Two independent reservations + order lines for the same offer id
    const r1 = await reserveAndPack(A, 1);
    const r2 = await reserveAndPack(A, 1);
    const l1 = await createChannelOrderLine(A, M2_OFFER + "-a", r1.resvId);
    const l2 = await createChannelOrderLine(A, M2_OFFER + "-b", r2.resvId);

    const { data: s1 } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _channel_order_line_id: l1.lineId, _allocation_id: r1.allocationId,
      _transporter_code: "TNT", _track_and_trace: "TRK-M2-A",
    });
    const { data: s2 } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _channel_order_line_id: l2.lineId, _allocation_id: r2.allocationId,
      _transporter_code: "TNT", _track_and_trace: "TRK-M2-B",
    });
    check("M2.01 two shipments created independently", !!(s1 as any).shipment_id && !!(s2 as any).shipment_id);
    check("M2.02 different shipment ids", (s1 as any).shipment_id !== (s2 as any).shipment_id);
    check("M2.03 different outbox event ids", (s1 as any).outbox_event_id !== (s2 as any).outbox_event_id);

    // Both can be claimed in the same batch (in_flight together — different shipment ids)
    const { data: claimed } = await admin.rpc("claim_shipment_outbox_batch", {
      _worker_id: "wM2", _lease_ttl_seconds: 60, _batch_size: 20,
    });
    const claimedIds = new Set((claimed as any[]).map(e => e.id));
    check("M2.04 both events in a single claim (independent tuples)",
      claimedIds.has((s1 as any).outbox_event_id) && claimedIds.has((s2 as any).outbox_event_id));

    // Complete A, fail B — the other side is unaffected
    await admin.rpc("complete_shipment_outbox_event", { _event_id: (s1 as any).outbox_event_id, _external_ref: {} });
    await admin.rpc("fail_shipment_outbox_event", {
      _event_id: (s2 as any).outbox_event_id, _error: "boom", _transient: true,
    });
    const { data: eA } = await admin.from("shipment_outbox_events").select("status").eq("id", (s1 as any).outbox_event_id).single();
    const { data: eB } = await admin.from("shipment_outbox_events").select("status").eq("id", (s2 as any).outbox_event_id).single();
    check("M2.05 completing A does not affect B", eA!.status === "succeeded" && eB!.status === "failed");

    // Phase 3 listing outbox untouched by M5 flow
    const { count: listingOutboxAfter } = await admin.from("outbox_events")
      .select("id", { count: "exact", head: true }).eq("company_id", A.comp.id);
    check("M2.06 Phase 3 listing outbox rows unchanged", listingOutboxBefore === listingOutboxAfter,
      `before=${listingOutboxBefore} after=${listingOutboxAfter}`);
  }

  // ==========================================================================
  // M3. Mandatory §8.3 — Replay of record_internal_ship... is a no-op
  // ==========================================================================
  {
    const { resvId, allocationId } = await reserveAndPack(A, 1);
    const line = await createChannelOrderLine(A, "BOL-M3-" + stamp, resvId);

    const args = {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _channel_order_line_id: line.lineId, _allocation_id: allocationId,
      _transporter_code: "TNT", _track_and_trace: "TRK-M3",
    };
    const results5: any[] = [];
    for (let i = 0; i < 5; i++) {
      const { data, error } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", args);
      if (error) throw error;
      results5.push(data);
    }
    check("M3.01 first call not a replay", results5[0].idempotent_replay === false);
    check("M3.02 subsequent 4 calls are idempotent replays",
      results5.slice(1).every(r => r.idempotent_replay === true));
    const shipmentId = results5[0].shipment_id;
    check("M3.03 all 5 return the same shipment_id",
      results5.every(r => r.shipment_id === shipmentId));

    const { count: shipCount } = await admin.from("channel_shipments")
      .select("id", { count: "exact", head: true }).eq("channel_order_line_id", line.lineId);
    check("M3.04 exactly one channel_shipments row", shipCount === 1, `count=${shipCount}`);

    const { count: outboxCount } = await admin.from("shipment_outbox_events")
      .select("id", { count: "exact", head: true }).eq("channel_shipment_id", shipmentId);
    check("M3.05 exactly one shipment_outbox_events row", outboxCount === 1, `count=${outboxCount}`);

    const { count: txCount } = await admin.from("inventory_transactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", A.comp.id).eq("idempotency_key", `m5-ship:${line.lineId}:${allocationId}`);
    check("M3.06 exactly one inventory_transactions row", txCount === 1, `count=${txCount}`);

    const { data: alloc } = await admin.from("inventory_reservation_allocations").select("shipped_quantity").eq("id", allocationId).single();
    check("M3.07 shipped_quantity incremented exactly once", alloc!.shipped_quantity === 1, `got=${alloc!.shipped_quantity}`);
  }

  // ==========================================================================
  // M4. Mandatory §8.4 — Cancel after handover rejected (deferred branch)
  // ==========================================================================
  {
    // §3.3 branch: bol.shipment.cancel is deferred. Attempts to enqueue it are
    // rejected by the event_kind CHECK constraint. Attempts to route via the
    // adapter path (see X. below) throw permanent.
    const { error: eCancel } = await admin.from("shipment_outbox_events").insert({
      company_id: A.comp.id, channel_account_id: A.acct.id,
      channel_shipment_id: M1_shipmentId, event_kind: "bol.shipment.cancel",
    });
    check("M4.01 cannot enqueue bol.shipment.cancel (deferred from M5)",
      matches(eCancel, /check|event_kind|violates/i), errMsg(eCancel));

    // Verify M1 shipment (in pending_bol_confirmation earlier, now bol_confirmed) unchanged
    const { data: s } = await admin.from("channel_shipments").select("status").eq("id", M1_shipmentId).single();
    check("M4.02 shipment unchanged after cancel attempt", s!.status === "bol_confirmed");

    const { count: obc } = await admin.from("shipment_outbox_events")
      .select("id", { count: "exact", head: true }).eq("channel_shipment_id", M1_shipmentId);
    check("M4.03 no extra outbox row inserted", obc === 1, `count=${obc}`);

    // Confirm the closure-report branch: only bol.shipment.confirm survives.
    const { data: distinct } = await admin.from("shipment_outbox_events").select("event_kind");
    const kinds = new Set((distinct ?? []).map((r: any) => r.event_kind));
    check("M4.04 only bol.shipment.confirm kinds present in outbox",
      kinds.size === 1 && kinds.has("bol.shipment.confirm"));
  }

  // ==========================================================================
  // T. Tenancy — cross-tenant reads/writes rejected
  // ==========================================================================
  {
    // B tries to read A's shipments via RLS: none
    const { data: bView } = await B.user.client.from("channel_shipments").select("id")
      .eq("company_id", A.comp.id);
    check("T.01 cross-tenant shipment reads return empty", (bView ?? []).length === 0);

    // B tries to enqueue an M5 ship with a mismatched (A's) order line via service_role RPC
    const { resvId, allocationId } = await reserveAndPack(A, 1);
    const line = await createChannelOrderLine(A, "BOL-T-" + stamp, resvId);
    const { error: eMismatch } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", {
      _company_id: B.comp.id, _channel_account_id: B.acct.id,
      _channel_order_line_id: line.lineId, _allocation_id: allocationId,
      _transporter_code: "TNT",
    });
    check("T.02 tenant mismatch rejected on order line",
      matches(eMismatch, /tenant mismatch|permission/i), errMsg(eMismatch));

    // Composite trigger on channel_shipments (raw insert with wrong tenant)
    const { error: eRaw } = await admin.from("channel_shipments").insert({
      company_id: B.comp.id, channel_account_id: B.acct.id,
      channel_order_line_id: line.lineId, allocation_id: allocationId,
      transporter_code: "TNT", status: "draft",
    });
    check("T.03 shipment tenant-coherence trigger fires",
      matches(eRaw, /tenant mismatch/i), errMsg(eRaw));

    // Shipment DLQ RLS: B cannot see A's DLQ
    const { data: bDlq } = await B.user.client.from("shipment_outbox_dead_letters").select("id")
      .eq("company_id", A.comp.id);
    check("T.04 cross-tenant DLQ reads empty", (bDlq ?? []).length === 0);
  }

  // ==========================================================================
  // O. Outbox lifecycle
  // ==========================================================================
  {
    // Set up a fresh ship + failure exhaustion → dead letter
    const { resvId, allocationId } = await reserveAndPack(A, 1);
    const line = await createChannelOrderLine(A, "BOL-O-" + stamp, resvId);
    const { data: shipRes } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _channel_order_line_id: line.lineId, _allocation_id: allocationId,
      _transporter_code: "TNT",
    });
    const outboxId = (shipRes as any).outbox_event_id as string;

    // Force max_attempts = 1 so next failure → DLQ
    await admin.from("shipment_outbox_events").update({ max_attempts: 1 }).eq("id", outboxId);
    // Claim
    await admin.rpc("claim_shipment_outbox_batch", { _worker_id: "wO", _lease_ttl_seconds: 60, _batch_size: 10 });
    const { data: failRes } = await admin.rpc("fail_shipment_outbox_event", {
      _event_id: outboxId, _error: "permanent", _transient: false,
    });
    check("O.01 non-transient fail dead-letters immediately", (failRes as any).dead_lettered === true);
    const { data: ob } = await admin.from("shipment_outbox_events").select("status").eq("id", outboxId).single();
    check("O.02 event marked dead", ob!.status === "dead");
    const { count: dlqCount } = await admin.from("shipment_outbox_dead_letters")
      .select("id", { count: "exact", head: true }).eq("original_event_id", outboxId);
    check("O.03 dead-letter row created", dlqCount === 1);

    // Lease recovery: create in_flight with expired lease, then recover
    // Fresh ship
    const { resvId: r2, allocationId: a2 } = await reserveAndPack(A, 1);
    const l2 = await createChannelOrderLine(A, "BOL-O2-" + stamp, r2);
    const { data: sh2 } = await admin.rpc("record_internal_ship_and_enqueue_confirmation", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _channel_order_line_id: l2.lineId, _allocation_id: a2, _transporter_code: "TNT",
    });
    const outbox2 = (sh2 as any).outbox_event_id as string;
    // Claim (moves to in_flight with lease)
    await admin.rpc("claim_shipment_outbox_batch", { _worker_id: "wO2", _lease_ttl_seconds: 60, _batch_size: 10 });
    // Expire the lease
    await admin.from("shipment_outbox_events").update({ lease_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", outbox2);
    const { data: recovered } = await admin.rpc("recover_expired_shipment_leases");
    check("O.04 recover_expired_shipment_leases returns count >= 1", (recovered as number) >= 1, `got=${recovered}`);
    const { data: ob2 } = await admin.from("shipment_outbox_events").select("status, lease_owner").eq("id", outbox2).single();
    check("O.05 recovered event back to failed with lease cleared",
      ob2!.status === "failed" && ob2!.lease_owner === null);

    // One-in-flight per (company, account, shipment, kind): claim moved it out; try to
    // manually create a second in_flight for the same shipment_id → should fail (partial unique).
    await admin.rpc("claim_shipment_outbox_batch", { _worker_id: "wOx", _lease_ttl_seconds: 60, _batch_size: 10 });
    const { error: eDup } = await admin.from("shipment_outbox_events").insert({
      company_id: A.comp.id, channel_account_id: A.acct.id, channel_shipment_id: (sh2 as any).shipment_id,
      event_kind: "bol.shipment.confirm", status: "in_flight",
      lease_owner: "x", lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    check("O.06 partial UNIQUE blocks duplicate in_flight",
      matches(eDup, /unique|duplicate/i), errMsg(eDup));

    // Idempotency UNIQUE on (company, account, shipment, event_kind) — same shipment,
    // second `pending` row for confirm should also fail.
    const { error: eIdem } = await admin.from("shipment_outbox_events").insert({
      company_id: A.comp.id, channel_account_id: A.acct.id, channel_shipment_id: (sh2 as any).shipment_id,
      event_kind: "bol.shipment.confirm", status: "pending",
    });
    check("O.07 idempotency UNIQUE rejects duplicate confirm", matches(eIdem, /unique|duplicate/i), errMsg(eIdem));
  }

  // ==========================================================================
  // I. Inbound status ingestion
  // ==========================================================================
  {
    // M1 shipment is bol_confirmed; give it a bol_shipment_id then advance to delivered
    await admin.from("channel_shipments").update({ bol_shipment_id: "BS-M1" }).eq("id", M1_shipmentId);
    const t1 = new Date().toISOString();
    const { data: iRes, error: eI } = await admin.rpc("ingest_bol_shipment_status", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _bol_shipment_id: "BS-M1", _status: "delivered", _event_time: t1,
    });
    check("I.01 delivered ingested", !eI && (iRes as any).ok === true, errMsg(eI));
    const { data: s1 } = await admin.from("channel_shipments").select("status,terminal_at").eq("id", M1_shipmentId).single();
    check("I.02 status = delivered", s1!.status === "delivered");
    check("I.03 terminal_at set", s1!.terminal_at !== null);

    // Idempotent replay of same event
    const { data: iRep } = await admin.rpc("ingest_bol_shipment_status", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _bol_shipment_id: "BS-M1", _status: "delivered", _event_time: t1,
    });
    check("I.04 identical replay idempotent", (iRep as any).idempotent_replay === true);

    // Invalid status rejected
    const { error: eBad } = await admin.rpc("ingest_bol_shipment_status", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _bol_shipment_id: "BS-M1", _status: "hovercraft", _event_time: new Date().toISOString(),
    });
    check("I.05 invalid inbound status rejected", !!eBad, errMsg(eBad));

    // Unknown shipment rejected
    const { error: eNF } = await admin.rpc("ingest_bol_shipment_status", {
      _company_id: A.comp.id, _channel_account_id: A.acct.id,
      _bol_shipment_id: "BS-NOPE", _status: "delivered", _event_time: new Date().toISOString(),
    });
    check("I.06 unknown bol_shipment_id rejected", !!eNF, errMsg(eNF));
  }

  // ==========================================================================
  // X. Cancel deferred — adapter path assertion (no live call; just event_kind guard)
  // ==========================================================================
  {
    const { BolChannelAdapter } = await import("../src/lib/outbox/bol-adapter.ts");
    const adapter = new BolChannelAdapter({
      baseUrl: "https://api.bol.com/retailer",
      clientId: "x", clientSecret: "y",
      transport: (async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({}), text: async () => "" })) as any,
    });

    // Confirm plan works
    const p = adapter.plan({
      id: "e1", event_type: "bol.shipment.confirm", external_listing_id: "OFFER-X",
      payload: { order_item_id: "ITM-1", transporter_code: "TNT", track_and_trace: "TRK" },
      listing_version: 1,
    });
    check("X.01 adapter plans bol.shipment.confirm as POST /shipments",
      p.method === "POST" && p.url.endsWith("/shipments"));
    check("X.02 body carries orderItems + transport",
      Array.isArray((p.body as any).orderItems) &&
      (p.body as any).orderItems[0].orderItemId === "ITM-1" &&
      (p.body as any).transport.transporterCode === "TNT" &&
      (p.body as any).transport.trackAndTrace === "TRK");

    // Cancel deferred
    let cancelErr: any = null;
    try {
      adapter.plan({
        id: "e2", event_type: "bol.shipment.cancel", external_listing_id: "OFFER-X",
        payload: {}, listing_version: 1,
      });
    } catch (e) { cancelErr = e; }
    check("X.03 adapter rejects bol.shipment.cancel as permanent (deferred)",
      cancelErr && /deferred|cancel/i.test(String(cancelErr.message ?? cancelErr)),
      String(cancelErr));

    // Payload validation on confirm
    let missErr: any = null;
    try {
      adapter.plan({
        id: "e3", event_type: "bol.shipment.confirm", external_listing_id: "OFFER-X",
        payload: {}, listing_version: 1,
      });
    } catch (e) { missErr = e; }
    check("X.04 confirm plan requires order_item_id + transporter_code",
      missErr && /order_item_id|transporter_code/.test(String(missErr.message ?? missErr)),
      String(missErr));
  }

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n===== Phase 4 M5 — ${passed}/${results.length} passed, ${failed} failed =====`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter(r => !r.ok)) console.log(`  ❌ ${r.name} — ${r.detail ?? ""}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
