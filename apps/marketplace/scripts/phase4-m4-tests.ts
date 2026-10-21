/**
 * Phase 4 Migration 4 verification — Outbound Bol writes via Phase 3 outbox.
 *
 * S. Schema      — new tables, columns, constraints.
 * G. Grants      — completion/decision RPCs are service_role only.
 * E. Enqueue     — 5 event types succeed; input validation; OCC.
 * M. Mode gate   — read_only/disabled reject enqueue; shadow + live accept.
 * A. Auth        — anon/non-member cannot enqueue.
 * D. Decision    — p4_dispatch_decision returns each expected value.
 * F. Fail-closed — complete_shadow refuses when decision=live; complete_live
 *                  refuses when decision=shadow. Kill switch flips both.
 * K. Kill switch — defer path unclaims to pending WITHOUT consuming attempts.
 *                  Import path (M2) still works while writes are blocked.
 * X. Cross-tenant — dispatch rows visible only to own company; enqueue by
 *                   other-company member refused.
 * N. No side FX  — no inventory ledger row, no channel_orders row, no
 *                   channel_listing quantity change from any M4 flow.
 *
 * Usage: bunx tsx scripts/phase4-m4-tests.ts
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

async function claimBatch(channel_account_id: string, batch_size = 20) {
  const { data, error } = await admin.rpc("claim_outbox_batch", {
    _channel_account_id: channel_account_id, _batch_size: batch_size, _lease_seconds: 60,
  });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; claim_token: string; event_type: string; listing_version: number; payload: Record<string, unknown> }>;
}

async function setMode(connection_id: string, mode: string, live_sync_enabled?: boolean) {
  const patch: Record<string, unknown> = { mode };
  if (live_sync_enabled !== undefined) patch.live_sync_enabled = live_sync_enabled;
  const { error } = await admin.from("channel_connections").update(patch).eq("id", connection_id);
  if (error) throw error;
}

async function killSwitch(scope: "global" | "connection", connection_id: string | null, writes_disabled: boolean) {
  // Match NULL with .is(); regular eq/match cannot compare against NULL in PostgREST.
  const q = admin.from("channel_kill_switches").select("id").eq("scope", scope);
  const { data: existing } = await (connection_id === null
    ? q.is("connection_id", null).maybeSingle()
    : q.eq("connection_id", connection_id).maybeSingle());
  if (existing) {
    const { error } = await admin.from("channel_kill_switches").update({ writes_disabled }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("channel_kill_switches").insert({ scope, connection_id, writes_disabled });
    if (error) throw error;
  }
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p4m4_alice_${stamp}@borvat.test`);
  const bob   = await mkUser(`p4m4_bob_${stamp}@borvat.test`);
  const eve   = await mkUser(`p4m4_eve_${stamp}@borvat.test`);

  const { data: compA } = await alice.client.from("companies")
    .insert({ name: "P4M4A", slug: `p4m4a-${stamp}`, owner_user_id: alice.uid }).select().single();
  const { data: compB } = await bob.client.from("companies")
    .insert({ name: "P4M4B", slug: `p4m4b-${stamp}`, owner_user_id: bob.uid }).select().single();

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

  // SKUs
  const { data: skuA } = await admin.from("catalog_skus")
    .insert({ company_id: compA!.id, code: `A-${stamp}`, tracking_mode: "none", status: "active" }).select().single();
  const { data: skuB } = await admin.from("catalog_skus")
    .insert({ company_id: compB!.id, code: `B-${stamp}`, tracking_mode: "none", status: "active" }).select().single();

  // Listings
  const { data: L_A } = await alice.client.from("channel_listings")
    .insert({ company_id: compA!.id, channel_account_id: acctA!.id, sku_id: skuA!.id,
              external_listing_id: "LA-" + stamp, units_per_offer: 1, channel_cap: 500 })
    .select().single();
  const { data: L_B } = await bob.client.from("channel_listings")
    .insert({ company_id: compB!.id, channel_account_id: acctB!.id, sku_id: skuB!.id,
              external_listing_id: "LB-" + stamp, units_per_offer: 1, channel_cap: 500 })
    .select().single();

  // =========================================================================
  // S. Schema
  // =========================================================================
  {
    for (const t of ["channel_shadow_dispatches", "channel_live_dispatches"]) {
      const { error } = await admin.from(t).select("id").limit(0);
      check(`S.01 table ${t} exists`, !error, error?.message);
    }
    const { data: cols } = await admin.rpc("has_role", { _user_id: alice.uid, _role: "buyer" }); void cols;
    // p4_dispatch_decision reachable by service_role
    const { data: dec, error } = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("S.02 p4_dispatch_decision callable by service_role", !error, error?.message);
    check("S.03 decision starts as blocked_read_only (default mode)", dec === "blocked_read_only", `dec=${dec}`);
  }

  // =========================================================================
  // G. Grants — completion + decision RPCs are service_role only
  // =========================================================================
  {
    for (const fn of ["complete_outbox_event_shadow", "complete_outbox_event_live", "defer_outbox_event_kill_switch", "p4_dispatch_decision", "_p4_enqueue_bol_write"]) {
      const args: Record<string, unknown> =
        fn === "p4_dispatch_decision" ? { _channel_account_id: acctA!.id } :
        fn === "_p4_enqueue_bol_write" ? { _listing_id: L_A!.id, _event_type: "x", _payload: {}, _expected_version: null, _reason: "x" } :
        fn === "complete_outbox_event_live" ? { _event_id: crypto.randomUUID(), _claim_token: crypto.randomUUID(), _http_status: 200 } :
        fn === "defer_outbox_event_kill_switch" ? { _event_id: crypto.randomUUID(), _claim_token: crypto.randomUUID(), _reason: "x" } :
        { _event_id: crypto.randomUUID(), _claim_token: crypto.randomUUID() };
      const { error } = await alice.client.rpc(fn, args);
      check(`G.${fn} authenticated blocked`, matches(error, /permission denied|function .* does not exist/i), error?.message ?? "no error");
    }
  }

  // =========================================================================
  // M. Mode gate on enqueue
  // =========================================================================
  {
    // mode='read_only' (default) → refused
    const { error } = await alice.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 10, _reason: "init" });
    check("M.01 enqueue refused when mode=read_only",
      matches(error, /read_only|not permitted/i), error?.message);
  }
  {
    await setMode(connA as string, "disabled");
    const { error } = await alice.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 10, _reason: "init" });
    check("M.02 enqueue refused when mode=disabled", matches(error, /disabled/i), error?.message);
  }
  {
    await setMode(connA as string, "shadow");
    const { data, error } = await alice.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 25, _reason: "shadow-first" });
    check("M.03 enqueue ok when mode=shadow", !error && !!data, error?.message);
  }

  // =========================================================================
  // E. Enqueue — all 5 event types (mode=shadow on connA)
  // =========================================================================
  const enqueued: Record<string, { event_id: string; version: number }> = {};
  {
    const { data, error } = await alice.client.rpc("bol_enqueue_offer_price_set",
      { _listing_id: L_A!.id, _price_cents: 1999, _currency: "EUR", _reason: "price-1" });
    check("E.01 price.set enqueue ok", !error && !!data, error?.message);
    if (data) enqueued["price"] = { event_id: (data as { event_id: string }).event_id, version: (data as { listing_version: number }).listing_version };
  }
  {
    const { data, error } = await alice.client.rpc("bol_enqueue_offer_fulfilment_set",
      { _listing_id: L_A!.id, _method: "FBR", _reason: "fbr" });
    check("E.02 fulfilment.set FBR ok", !error && !!data, error?.message);
    if (data) enqueued["fulfilment"] = { event_id: (data as { event_id: string }).event_id, version: (data as { listing_version: number }).listing_version };
  }
  {
    const { error } = await alice.client.rpc("bol_enqueue_offer_fulfilment_set",
      { _listing_id: L_A!.id, _method: "FBB", _reason: "fbb" });
    check("E.03 fulfilment.set FBB refused (out of scope)", matches(error, /FBR/i), error?.message);
  }
  {
    const { data, error } = await alice.client.rpc("bol_enqueue_offer_delivery_promise_set",
      { _listing_id: L_A!.id, _promise: { cutoff_time: "17:00", country: "NL" }, _reason: "promise-1" });
    check("E.04 delivery_promise.set ok", !error && !!data, error?.message);
    if (data) enqueued["promise"] = { event_id: (data as { event_id: string }).event_id, version: (data as { listing_version: number }).listing_version };
  }
  {
    const { data, error } = await alice.client.rpc("bol_enqueue_offer_resync",
      { _listing_id: L_A!.id, _reason: "resync" });
    check("E.05 resync ok", !error && !!data, error?.message);
    if (data) enqueued["resync"] = { event_id: (data as { event_id: string }).event_id, version: (data as { listing_version: number }).listing_version };
  }
  {
    // Input validation
    const bad1 = await alice.client.rpc("bol_enqueue_offer_stock_set", { _listing_id: L_A!.id, _quantity: -1, _reason: "x" });
    check("E.06 stock.set rejects negative quantity", matches(bad1.error, />= 0|must be/i), bad1.error?.message);
    const bad2 = await alice.client.rpc("bol_enqueue_offer_price_set", { _listing_id: L_A!.id, _price_cents: 0, _currency: "EUR", _reason: "x" });
    check("E.07 price.set rejects price=0", matches(bad2.error, /price_cents/i), bad2.error?.message);
    const bad3 = await alice.client.rpc("bol_enqueue_offer_price_set", { _listing_id: L_A!.id, _price_cents: 100, _currency: "eur", _reason: "x" });
    check("E.08 price.set rejects lowercase currency", matches(bad3.error, /currency/i), bad3.error?.message);
    const bad4 = await alice.client.rpc("bol_enqueue_offer_stock_set", { _listing_id: L_A!.id, _quantity: 5, _reason: "" });
    check("E.09 enqueue rejects empty reason", matches(bad4.error, /reason/i), bad4.error?.message);
  }
  {
    // OCC: pass wrong expected_version
    const { data: cur } = await admin.from("channel_listings").select("published_version").eq("id", L_A!.id).single();
    const wrong = (cur!.published_version as number) - 1;
    const { error } = await alice.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 30, _reason: "occ", _expected_version: wrong });
    check("E.10 OCC version conflict raises P0001", matches(error, /version conflict/i), error?.message);
  }
  {
    // Monotonic listing_version across events
    const versions = Object.values(enqueued).map(v => v.version).sort((a, b) => a - b);
    const strictly = versions.every((v, i) => i === 0 || v > versions[i - 1]);
    check("E.11 listing_version strictly monotonic across events", strictly, versions.join(","));
  }

  // =========================================================================
  // A. Auth
  // =========================================================================
  {
    const { error } = await anonClient().rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 1, _reason: "anon" });
    check("A.01 anon cannot enqueue", matches(error, /authenticated|permission denied|not authenticated/i), error?.message);
  }
  {
    const { error } = await eve.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 1, _reason: "eve" });
    check("A.02 non-member cannot enqueue", matches(error, /permission|not a member|listings\.manage/i), error?.message);
  }
  {
    // bob (compB owner) tries on L_A → wrong company
    const { error } = await bob.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 1, _reason: "cross" });
    check("A.03 cross-company member cannot enqueue", matches(error, /permission|listings\.manage/i), error?.message);
  }

  // =========================================================================
  // D. Decision helper — six outcomes
  // =========================================================================
  {
    // conn A currently mode=shadow, live_sync_enabled default false, no kill switch → shadow
    const { data } = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.01 shadow → decision=shadow", data === "shadow", `d=${data}`);
    await setMode(connA as string, "read_only");
    const r1 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.02 read_only → blocked_read_only", r1.data === "blocked_read_only", `d=${r1.data}`);
    await setMode(connA as string, "disabled");
    const r2 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.03 disabled → blocked_disabled", r2.data === "blocked_disabled", `d=${r2.data}`);
    await setMode(connA as string, "live", false);
    const r3 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.04 live + live_sync_enabled=false → shadow", r3.data === "shadow", `d=${r3.data}`);
    await setMode(connA as string, "live", true);
    const r4 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.05 live + live_sync_enabled=true → live", r4.data === "live", `d=${r4.data}`);
    await killSwitch("connection", connA as string, true);
    const r5 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.06 per-account kill → blocked_kill_switch", r5.data === "blocked_kill_switch", `d=${r5.data}`);
    await killSwitch("connection", connA as string, false);
    await killSwitch("global", null, true);
    const r6 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acctA!.id });
    check("D.07 global kill → blocked_kill_switch", r6.data === "blocked_kill_switch", `d=${r6.data}`);
    await killSwitch("global", null, false);
    // orphan account with no connection
    const { data: acct2 } = await alice.client.from("channel_accounts")
      .insert({ company_id: compA!.id, provider: "bol", external_account_id: "orph-" + stamp, display_name: "Orph" }).select().single();
    const r7 = await admin.rpc("p4_dispatch_decision", { _channel_account_id: acct2!.id });
    check("D.08 no connection → blocked_no_connection", r7.data === "blocked_no_connection", `d=${r7.data}`);
  }

  // =========================================================================
  // Shadow dispatch flow: back to shadow mode
  // =========================================================================
  await setMode(connA as string, "shadow", false);

  const shadowEventId = enqueued["price"].event_id;

  // =========================================================================
  // F.1 — Fail-closed: shadow mode → complete_live refused
  // =========================================================================
  {
    // Claim the first pending event for acctA
    const claimed = await claimBatch(acctA!.id, 1);
    check("F.pre claimed 1 event", claimed.length === 1, `count=${claimed.length}`);
    const ev = claimed[0];
    const bad = await admin.rpc("complete_outbox_event_live", {
      _event_id: ev.id, _claim_token: ev.claim_token, _http_status: 200,
      _external_ref: {}, _bol_process_status_id: null,
      _request_started_at: null, _request_ended_at: null,
    });
    check("F.01 complete_live refused when decision=shadow",
      matches(bad.error, /decision is shadow|refused/i), bad.error?.message);
    // Now complete via shadow
    const good = await admin.rpc("complete_outbox_event_shadow", { _event_id: ev.id, _claim_token: ev.claim_token });
    check("F.02 complete_shadow ok when decision=shadow", !good.error, good.error?.message);
    // Row inserted
    const { data: row } = await admin.from("channel_shadow_dispatches").select("*").eq("event_id", ev.id).single();
    check("F.03 shadow dispatch row inserted", !!row);
    check("F.04 shadow row has connection_mode=shadow", row?.connection_mode === "shadow");
    check("F.05 shadow row has same event_type", row?.event_type === ev.event_type);
    check("F.06 shadow row has same listing_version", row?.listing_version === ev.listing_version);
    // Event delivered
    const { data: evd } = await admin.from("outbox_events").select("status,delivered_at,attempts").eq("id", ev.id).single();
    check("F.07 event marked delivered", evd?.status === "delivered" && evd?.delivered_at !== null);
    check("F.08 attempts incremented to 1", evd?.attempts === 1);
  }

  // =========================================================================
  // Live dispatch flow
  // =========================================================================
  await setMode(connA as string, "live", true);
  {
    // Claim another event
    const claimed = await claimBatch(acctA!.id, 1);
    check("L.pre claimed 1 more event", claimed.length === 1, `count=${claimed.length}`);
    const ev = claimed[0];
    // shadow completion refused in live
    const bad = await admin.rpc("complete_outbox_event_shadow", { _event_id: ev.id, _claim_token: ev.claim_token });
    check("L.01 complete_shadow refused when decision=live",
      matches(bad.error, /decision is live|refused/i), bad.error?.message);
    // Live succeeds
    const good = await admin.rpc("complete_outbox_event_live", {
      _event_id: ev.id, _claim_token: ev.claim_token,
      _http_status: 202, _external_ref: { bol_id: "bol-" + ev.id.slice(0, 8) },
      _bol_process_status_id: "ps-1",
      _request_started_at: new Date(Date.now() - 500).toISOString(),
      _request_ended_at:   new Date().toISOString(),
    });
    check("L.02 complete_live ok when decision=live", !good.error, good.error?.message);
    const { data: row } = await admin.from("channel_live_dispatches").select("*").eq("event_id", ev.id).single();
    check("L.03 live dispatch row inserted", !!row);
    check("L.04 live row http_status=202", row?.http_status === 202);
    check("L.05 live row bol_process_status_id=ps-1", row?.bol_process_status_id === "ps-1");
    // 4xx must be refused (use fail_outbox_event instead)
    // First re-enqueue something to try
    const { data: e2 } = await alice.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 40, _reason: "live-2" });
    void e2;
    const claim2 = await claimBatch(acctA!.id, 1);
    const ev2 = claim2[0];
    const bad2 = await admin.rpc("complete_outbox_event_live", {
      _event_id: ev2.id, _claim_token: ev2.claim_token, _http_status: 400,
      _external_ref: {}, _bol_process_status_id: null,
      _request_started_at: null, _request_ended_at: null,
    });
    check("L.06 complete_live refuses http>=400", matches(bad2.error, /success http_status|http_status/i), bad2.error?.message);
    // clean up ev2 → fail it
    await admin.rpc("fail_outbox_event", { _event_id: ev2.id, _claim_token: ev2.claim_token, _error: "test-cleanup" });
  }

  // =========================================================================
  // K. Kill switch behaviour
  // =========================================================================
  {
    // enqueue one, claim, activate global kill, defer should succeed
    const { data: ke } = await alice.client.rpc("bol_enqueue_offer_stock_set",
      { _listing_id: L_A!.id, _quantity: 55, _reason: "kill-test" });
    void ke;
    const claim = await claimBatch(acctA!.id, 1);
    check("K.pre claimed one event", claim.length === 1);
    const ev = claim[0];

    await killSwitch("global", null, true);

    // complete_live refused because decision=blocked_kill_switch
    const badLive = await admin.rpc("complete_outbox_event_live", {
      _event_id: ev.id, _claim_token: ev.claim_token, _http_status: 200,
      _external_ref: {}, _bol_process_status_id: null,
      _request_started_at: null, _request_ended_at: null,
    });
    check("K.01 complete_live refused while kill switch active",
      matches(badLive.error, /blocked_kill_switch|refused/i), badLive.error?.message);

    // complete_shadow also refused (decision not shadow)
    const badShadow = await admin.rpc("complete_outbox_event_shadow", { _event_id: ev.id, _claim_token: ev.claim_token });
    check("K.02 complete_shadow refused while kill switch active",
      matches(badShadow.error, /blocked_kill_switch|refused/i), badShadow.error?.message);

    // defer succeeds
    const def = await admin.rpc("defer_outbox_event_kill_switch",
      { _event_id: ev.id, _claim_token: ev.claim_token, _reason: "kill_switch_active" });
    check("K.03 defer succeeds when kill switch active", !def.error, def.error?.message);

    const { data: ed } = await admin.from("outbox_events").select("status,attempts,claim_token").eq("id", ev.id).single();
    check("K.04 event back to pending after defer", ed?.status === "pending");
    check("K.05 defer does NOT consume attempts", ed?.attempts === 0, `attempts=${ed?.attempts}`);
    check("K.06 claim_token cleared", ed?.claim_token === null);

    // Verify defer refuses when writes are actually allowed (live)
    await killSwitch("global", null, false);
    // Claim again
    const claim2 = await claimBatch(acctA!.id, 1);
    const ev2 = claim2[0];
    const badDefer = await admin.rpc("defer_outbox_event_kill_switch",
      { _event_id: ev2.id, _claim_token: ev2.claim_token, _reason: "spurious" });
    check("K.07 defer refused when writes are permitted",
      matches(badDefer.error, /writes are permitted|defer refused/i), badDefer.error?.message);

    // Clean up ev2 (still in_flight): complete via live
    await admin.rpc("complete_outbox_event_live", {
      _event_id: ev2.id, _claim_token: ev2.claim_token, _http_status: 200,
      _external_ref: {}, _bol_process_status_id: null,
      _request_started_at: null, _request_ended_at: null,
    });

    // Import path still works while writes were blocked → verify one M2 RPC callable
    await killSwitch("global", null, true);
    const { data: imp, error: impErr } = await admin.rpc("begin_offer_import_batch", {
      _company_id: compA!.id, _channel_account_id: acctA!.id, _connection_id: connA as string,
    });
    check("K.08 import RPC still works while writes blocked", !impErr && !!imp, impErr?.message);
    await killSwitch("global", null, false);
  }

  // =========================================================================
  // X. Cross-tenant visibility
  // =========================================================================
  {
    // Alice can see A rows, not B rows
    const { data: aRows } = await alice.client.from("channel_shadow_dispatches").select("id").eq("company_id", compA!.id);
    check("X.01 alice sees own shadow rows", (aRows?.length ?? 0) >= 1);
    const { data: bRows } = await alice.client.from("channel_shadow_dispatches").select("id").eq("company_id", compB!.id);
    check("X.02 alice cannot see B shadow rows", (bRows?.length ?? 0) === 0);
    const { data: aLive } = await alice.client.from("channel_live_dispatches").select("id").eq("company_id", compA!.id);
    check("X.03 alice sees own live rows", (aLive?.length ?? 0) >= 1);
    const { data: bLive } = await bob.client.from("channel_live_dispatches").select("id").eq("company_id", compA!.id);
    check("X.04 bob cannot see A live rows", (bLive?.length ?? 0) === 0);
    // Direct INSERT blocked
    const badIns = await alice.client.from("channel_shadow_dispatches").insert({
      event_id: crypto.randomUUID(), company_id: compA!.id, channel_account_id: acctA!.id,
      connection_id: connA as string, listing_id: L_A!.id, listing_version: 1,
      event_type: "x", payload: {}, connection_mode: "shadow", reason_code: "hack",
    });
    check("X.05 authenticated cannot INSERT shadow row", !!badIns.error);
    const badIns2 = await alice.client.from("channel_live_dispatches").insert({
      event_id: crypto.randomUUID(), company_id: compA!.id, channel_account_id: acctA!.id,
      connection_id: connA as string, listing_id: L_A!.id, listing_version: 1,
      event_type: "x", payload: {}, http_status: 200,
      request_started_at: new Date().toISOString(), request_ended_at: new Date().toISOString(),
    });
    check("X.06 authenticated cannot INSERT live row", !!badIns2.error);
  }

  // =========================================================================
  // N. No side-effects on inventory / orders / listings state
  // =========================================================================
  {
    // published_quantity on L_A must not have moved (M4 only bumps version)
    const { data: L } = await admin.from("channel_listings").select("published_quantity,published_version").eq("id", L_A!.id).single();
    check("N.01 M4 does not change published_quantity", L?.published_quantity === 0, `q=${L?.published_quantity}`);
    check("N.02 published_version was bumped by M4 enqueues", (L?.published_version ?? 0) >= 5, `v=${L?.published_version}`);
    // no channel_orders
    const { count: co } = await admin.from("channel_orders").select("*", { count: "exact", head: true }).eq("company_id", compA!.id);
    check("N.03 no channel_orders written by M4", (co ?? 0) === 0);
    // no inventory transactions
    const { count: it } = await admin.from("inventory_transactions").select("*", { count: "exact", head: true }).eq("company_id", compA!.id);
    check("N.04 no inventory transactions from M4", (it ?? 0) === 0);
  }

  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n===== Phase 4 M4 RESULTS: ${pass}/${results.length} passed, ${fail} failed =====`);
  if (fail > 0) {
    for (const r of results.filter(r => !r.ok)) console.log(`FAIL: ${r.name}${r.detail ? " — " + r.detail : ""}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
