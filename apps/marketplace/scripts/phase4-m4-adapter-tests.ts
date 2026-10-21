/**
 * Phase 4 M4 — BolChannelAdapter + Bol worker verification.
 *
 * Two groups:
 *   U.*  Adapter unit tests via injected HTTP transport (no real Bol calls).
 *        Covers plan() shape for all 5 event types, OAuth token flow,
 *        202+process-status polling, and every retry/DLQ classification the
 *        user asked to see: 429 (Retry-After), 5xx, timeout, process FAILURE,
 *        poll timeout, and permanent 4xx.
 *   I.*  DB-integrated worker tests. Proves in the real Postgres surface that:
 *          - shadow mode issues ZERO HTTP calls, records a shadow row.
 *          - live mode issues HTTP calls, records a live row.
 *          - kill switch defers WITHOUT invoking the adapter.
 *          - repeated transient failures move the event to dead_letter.
 *
 * Usage: bunx tsx scripts/phase4-m4-adapter-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BolAdapterError,
  BolChannelAdapter,
  type HttpResponseLike,
  type HttpTransport,
} from "../src/lib/outbox/bol-adapter";
import {
  makeExternalListingIdResolver,
  runBolDispatchOnce,
} from "../src/lib/outbox/bol-worker";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Missing SUPABASE env");

const admin: SupabaseClient = createClient(URL, SR, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonClient = () =>
  createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

// ---------------------------------------------------------------------------
// Fake HTTP transport
// ---------------------------------------------------------------------------
interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}
type Responder = (call: FakeCall) => HttpResponseLike | Promise<HttpResponseLike>;

function fakeResponse(status: number, body: any, headers: Record<string, string> = {}): HttpResponseLike {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => {
        const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
        return key ? headers[key] : null;
      },
    },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

class FakeTransport {
  public calls: FakeCall[] = [];
  private handlers: Array<{ match: (c: FakeCall) => boolean; respond: Responder }> = [];

  when(match: (c: FakeCall) => boolean, respond: Responder) {
    this.handlers.push({ match, respond });
    return this;
  }
  reset() {
    this.calls = [];
    this.handlers = [];
  }
  get callCount() {
    return this.calls.length;
  }
  fetch: HttpTransport = async (url, init) => {
    const call: FakeCall = {
      method: (init?.method ?? "GET").toUpperCase(),
      url: String(url),
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body as string | undefined,
    };
    this.calls.push(call);
    for (const h of this.handlers) {
      if (h.match(call)) return await h.respond(call);
    }
    return fakeResponse(500, { error: "no handler", url: call.url });
  };
}

const BASE = "https://api.bol.com/retailer-demo";
const TOKEN_URL = "https://login.bol.com/token";
const OFFER_ID = "abc-offer-1";

function makeAdapter(t: FakeTransport, overrides: any = {}) {
  return new BolChannelAdapter({
    baseUrl: BASE,
    tokenUrl: TOKEN_URL,
    clientId: "cid",
    clientSecret: "csecret",
    transport: t.fetch,
    pollIntervalMs: 1,
    pollTimeoutMs: 2000,
    requestTimeoutMs: 2000,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

function tokenHandler(t: FakeTransport, accessToken = "tok_abc", ttl = 300) {
  t.when(
    (c) => c.method === "POST" && c.url === TOKEN_URL,
    () => fakeResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: ttl }),
  );
}

// ---------------------------------------------------------------------------
// U.* Adapter unit tests
// ---------------------------------------------------------------------------
async function runUnit() {
  console.log("\n───── U. Adapter unit tests ─────");

  // U.01–U.06 plan() shapes
  {
    const t = new FakeTransport();
    const a = makeAdapter(t);
    const stock = a.plan({
      id: "e1",
      event_type: "bol.offer.stock.set",
      external_listing_id: OFFER_ID,
      payload: { quantity: 42 },
      listing_version: 5,
    });
    check(
      "U.01 stock plan url+body",
      stock.method === "PUT" &&
        stock.url === `${BASE}/offers/${OFFER_ID}/stock` &&
        (stock.body as any).amount === 42 &&
        (stock.body as any).managedByRetailer === true &&
        stock.contentType === "application/vnd.retailer.v11+json",
      JSON.stringify(stock.body),
    );
    check("U.01a plan() does NOT touch transport", t.callCount === 0, `calls=${t.callCount}`);
  }
  {
    const a = makeAdapter(new FakeTransport());
    const price = a.plan({
      id: "e2",
      event_type: "bol.offer.price.set",
      external_listing_id: OFFER_ID,
      payload: { price_cents: 1999, currency: "EUR" },
      listing_version: 1,
    });
    const unit = (price.body as any).pricing?.bundlePrices?.[0]?.unitPrice;
    check(
      "U.02 price plan unitPrice = cents/100",
      unit === 19.99 && price.url.endsWith("/price"),
      `unitPrice=${unit}`,
    );
  }
  {
    const a = makeAdapter(new FakeTransport());
    try {
      a.plan({
        id: "e3",
        event_type: "bol.offer.fulfilment.set",
        external_listing_id: OFFER_ID,
        payload: { method: "FBB" },
        listing_version: 1,
      });
      check("U.03 fulfilment plan rejects non-FBR", false, "did not throw");
    } catch (e) {
      check(
        "U.03 fulfilment plan rejects non-FBR",
        e instanceof BolAdapterError && e.kind === "permanent",
        (e as Error).message,
      );
    }
  }
  {
    const a = makeAdapter(new FakeTransport());
    try {
      a.plan({
        id: "e4",
        event_type: "bol.offer.delivery_promise.set",
        external_listing_id: OFFER_ID,
        payload: { promise: {} },
        listing_version: 1,
      });
      check("U.04 delivery_promise requires deliveryCode", false, "did not throw");
    } catch (e) {
      check(
        "U.04 delivery_promise requires deliveryCode",
        e instanceof BolAdapterError && e.kind === "permanent",
        (e as Error).message,
      );
    }
  }
  {
    const a = makeAdapter(new FakeTransport());
    const p = a.plan({
      id: "e5",
      event_type: "bol.offer.resync",
      external_listing_id: OFFER_ID,
      payload: {},
      listing_version: 1,
    });
    check("U.05 resync plan is PATCH /offers/{id}", p.method === "PATCH" && p.url === `${BASE}/offers/${OFFER_ID}`);
  }
  {
    const a = makeAdapter(new FakeTransport());
    const fulf = a.plan({
      id: "e5a",
      event_type: "bol.offer.fulfilment.set",
      external_listing_id: OFFER_ID,
      payload: { method: "FBR" },
      listing_version: 1,
    });
    check(
      "U.05a fulfilment plan is PATCH /offers/{id} with partial body",
      fulf.method === "PATCH" &&
        fulf.url === `${BASE}/offers/${OFFER_ID}` &&
        (fulf.body as any).fulfilment?.method === "FBR" &&
        Object.keys(fulf.body).length === 1,
      JSON.stringify(fulf.body),
    );
  }
  {
    const a = makeAdapter(new FakeTransport());
    const dp = a.plan({
      id: "e5b",
      event_type: "bol.offer.delivery_promise.set",
      external_listing_id: OFFER_ID,
      payload: { promise: { deliveryCode: "24uurs-23" } },
      listing_version: 1,
    });
    check(
      "U.05b delivery_promise plan is PATCH /offers/{id} with partial body",
      dp.method === "PATCH" &&
        (dp.body as any).fulfilment?.deliveryCode === "24uurs-23" &&
        Object.keys(dp.body).length === 1,
      JSON.stringify(dp.body),
    );
  }
  // v10 mode: offer-level updates fall back to PUT and use the v10 media type.
  {
    const a = makeAdapter(new FakeTransport(), { apiVersion: "v10" });
    const fulf = a.plan({
      id: "e5c",
      event_type: "bol.offer.fulfilment.set",
      external_listing_id: OFFER_ID,
      payload: { method: "FBR" },
      listing_version: 1,
    });
    check(
      "U.05c v10 fulfilment plan is PUT + v10 media type",
      fulf.method === "PUT" &&
        fulf.url === `${BASE}/offers/${OFFER_ID}` &&
        fulf.contentType === "application/vnd.retailer.v10+json" &&
        fulf.accept === "application/vnd.retailer.v10+json",
      `${fulf.method} ${fulf.contentType}`,
    );
    const stock = a.plan({
      id: "e5d",
      event_type: "bol.offer.stock.set",
      external_listing_id: OFFER_ID,
      payload: { quantity: 3 },
      listing_version: 1,
    });
    check(
      "U.05d v10 stock plan stays PUT /stock with v10 media type",
      stock.method === "PUT" &&
        stock.url.endsWith("/stock") &&
        stock.contentType === "application/vnd.retailer.v10+json",
    );
  }
  {
    const a = makeAdapter(new FakeTransport());
    try {
      a.plan({
        id: "e6",
        event_type: "bol.offer.unknown",
        external_listing_id: OFFER_ID,
        payload: {},
        listing_version: 1,
      });
      check("U.06 unknown event_type → permanent", false, "did not throw");
    } catch (e) {
      check(
        "U.06 unknown event_type → permanent",
        e instanceof BolAdapterError && e.kind === "permanent",
      );
    }
  }

  // U.07 OAuth token flow — Basic auth, access_token cached
  {
    const t = new FakeTransport();
    tokenHandler(t, "TOK1");
    t.when(
      (c) => c.method === "PUT" && c.url.endsWith("/stock"),
      () => fakeResponse(202, { processStatusId: "ps1", status: "PENDING" }),
    );
    t.when(
      (c) => c.method === "GET" && c.url.includes("/process-status/ps1"),
      () => fakeResponse(200, { processStatusId: "ps1", status: "SUCCESS", entityId: OFFER_ID, eventType: "STOCK_UPDATE" }),
    );
    const a = makeAdapter(t);
    const res = await a.dispatchLive({
      id: "e7",
      event_type: "bol.offer.stock.set",
      external_listing_id: OFFER_ID,
      payload: { quantity: 3 },
      listing_version: 2,
    });
    const tokenCall = t.calls.find((c) => c.url === TOKEN_URL)!;
    check(
      "U.07 OAuth uses Basic auth + client_credentials",
      /^Basic /.test(tokenCall.headers.Authorization ?? "") &&
        tokenCall.body === "grant_type=client_credentials",
    );
    check(
      "U.08 success path returns http_status=200 + processStatusId",
      res.http_status === 200 && res.bol_process_status_id === "ps1",
      `http=${res.http_status} psid=${res.bol_process_status_id}`,
    );
    check(
      "U.09 dispatch used Bearer token from OAuth",
      (t.calls.find((c) => c.method === "PUT")!.headers.Authorization ?? "") === "Bearer TOK1",
    );

    // Second dispatch reuses cached token → only one POST to token endpoint
    await a.dispatchLive({
      id: "e7b",
      event_type: "bol.offer.stock.set",
      external_listing_id: OFFER_ID,
      payload: { quantity: 4 },
      listing_version: 3,
    });
    const tokenCalls = t.calls.filter((c) => c.url === TOKEN_URL).length;
    check("U.10 token cached across dispatches", tokenCalls === 1, `token calls=${tokenCalls}`);
  }

  // U.11 401 → refetch token → retry once
  {
    const t = new FakeTransport();
    let putCount = 0;
    let tokenCount = 0;
    t.when(
      (c) => c.method === "POST" && c.url === TOKEN_URL,
      () => {
        tokenCount++;
        return fakeResponse(200, { access_token: `t${tokenCount}`, expires_in: 300 });
      },
    );
    t.when(
      (c) => c.method === "PUT" && c.url.endsWith("/stock"),
      () => {
        putCount++;
        return putCount === 1
          ? fakeResponse(401, { error: "expired" })
          : fakeResponse(202, { processStatusId: "ps2", status: "PENDING" });
      },
    );
    t.when(
      (c) => c.url.includes("/process-status/ps2"),
      () => fakeResponse(200, { processStatusId: "ps2", status: "SUCCESS" }),
    );
    const a = makeAdapter(t);
    const res = await a.dispatchLive({
      id: "e8",
      event_type: "bol.offer.stock.set",
      external_listing_id: OFFER_ID,
      payload: { quantity: 1 },
      listing_version: 1,
    });
    check(
      "U.11 401 → token refresh → retry succeeds",
      tokenCount === 2 && putCount === 2 && res.http_status === 200,
      `tokens=${tokenCount} puts=${putCount}`,
    );
  }

  // U.12 429 with Retry-After → transient
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when(
      (c) => c.method === "PUT",
      () => fakeResponse(429, { error: "rate limited" }, { "Retry-After": "5" }),
    );
    const a = makeAdapter(t);
    try {
      await a.dispatchLive({
        id: "e9",
        event_type: "bol.offer.stock.set",
        external_listing_id: OFFER_ID,
        payload: { quantity: 1 },
        listing_version: 1,
      });
      check("U.12 429 throws transient", false);
    } catch (e) {
      check(
        "U.12 429 throws transient with retryAfterMs",
        e instanceof BolAdapterError && e.kind === "transient" && e.retryAfterMs === 5000,
        (e as BolAdapterError).message,
      );
    }
  }

  // U.13 5xx → transient
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when((c) => c.method === "PUT", () => fakeResponse(503, {}));
    const a = makeAdapter(t);
    try {
      await a.dispatchLive({ id: "e10", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
      check("U.13 503 → transient", false);
    } catch (e) {
      check("U.13 503 → transient", e instanceof BolAdapterError && e.kind === "transient", (e as Error).message);
    }
  }

  // U.14 400 → permanent
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when((c) => c.method === "PUT", () => fakeResponse(400, { error: "bad" }));
    const a = makeAdapter(t);
    try {
      await a.dispatchLive({ id: "e11", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
      check("U.14 400 → permanent", false);
    } catch (e) {
      check("U.14 400 → permanent", e instanceof BolAdapterError && e.kind === "permanent");
    }
  }

  // U.15 404 → permanent
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when((c) => c.method === "PUT", () => fakeResponse(404, {}));
    const a = makeAdapter(t);
    try {
      await a.dispatchLive({ id: "e12", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
      check("U.15 404 → permanent", false);
    } catch (e) {
      check("U.15 404 → permanent", e instanceof BolAdapterError && e.kind === "permanent");
    }
  }

  // U.16 processStatus FAILURE → transient
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when((c) => c.method === "PUT", () => fakeResponse(202, { processStatusId: "psF" }));
    t.when(
      (c) => c.url.includes("/process-status/psF"),
      () => fakeResponse(200, { status: "FAILURE", errorMessage: "SKU_NOT_FOUND" }),
    );
    const a = makeAdapter(t);
    try {
      await a.dispatchLive({ id: "e13", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
      check("U.16 process FAILURE → transient", false);
    } catch (e) {
      check(
        "U.16 process FAILURE → transient with reason",
        e instanceof BolAdapterError &&
          e.kind === "transient" &&
          /FAILURE|SKU_NOT_FOUND/.test(e.message),
        (e as Error).message,
      );
    }
  }

  // U.17 poll timeout → transient
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when((c) => c.method === "PUT", () => fakeResponse(202, { processStatusId: "psT" }));
    t.when(
      (c) => c.url.includes("/process-status/psT"),
      () => fakeResponse(200, { status: "PENDING" }),
    );
    let clock = 0;
    const a = makeAdapter(t, {
      now: () => {
        clock += 100;
        return clock;
      },
      pollIntervalMs: 1,
      pollTimeoutMs: 300,
    });
    try {
      await a.dispatchLive({ id: "e14", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
      check("U.17 poll timeout → transient", false);
    } catch (e) {
      check(
        "U.17 poll timeout → transient",
        e instanceof BolAdapterError && e.kind === "transient" && /poll timeout/i.test(e.message),
      );
    }
  }

  // U.18 request timeout on PUT → transient
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when(
      (c) => c.method === "PUT",
      () => new Promise<HttpResponseLike>(() => {/* never resolves */}),
    );
    const a = makeAdapter(t, { requestTimeoutMs: 50 });
    try {
      await a.dispatchLive({ id: "e15", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
      check("U.18 request timeout → transient", false);
    } catch (e) {
      check(
        "U.18 request timeout → transient",
        e instanceof BolAdapterError && e.kind === "transient" && /timeout/i.test(e.message),
      );
    }
  }

  // U.19 process-status 5xx during poll recovers when eventually SUCCESS
  {
    const t = new FakeTransport();
    tokenHandler(t);
    t.when((c) => c.method === "PUT", () => fakeResponse(202, { processStatusId: "psR" }));
    let pollN = 0;
    t.when(
      (c) => c.url.includes("/process-status/psR"),
      () => {
        pollN++;
        if (pollN === 1) return fakeResponse(503, {});
        if (pollN === 2) return fakeResponse(200, { status: "PENDING" });
        return fakeResponse(200, { status: "SUCCESS", processStatusId: "psR" });
      },
    );
    const a = makeAdapter(t);
    const res = await a.dispatchLive({ id: "e16", event_type: "bol.offer.stock.set", external_listing_id: OFFER_ID, payload: { quantity: 1 }, listing_version: 1 });
    check(
      "U.19 process-status 5xx recovers on retry",
      res.http_status === 200 && pollN >= 3,
      `pollN=${pollN}`,
    );
  }
}

// ---------------------------------------------------------------------------
// I.* DB integration tests
// ---------------------------------------------------------------------------
async function mkUser(email: string) {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  await c.auth.signInWithPassword({ email, password: pw });
  return { uid, client: c };
}

async function runIntegration() {
  console.log("\n───── I. Worker + DB integration ─────");
  const stamp = Date.now();
  const alice = await mkUser(`p4m4adapter_${stamp}@borvat.test`);

  const { data: company } = await alice.client
    .from("companies")
    .insert({ name: "P4M4Adapter", slug: `p4m4adapter-${stamp}`, owner_user_id: alice.uid })
    .select()
    .single();
  const { data: acct } = await alice.client
    .from("channel_accounts")
    .insert({
      company_id: company!.id,
      provider: "bol",
      external_account_id: "ADP-" + stamp,
      display_name: "Adapter Bol",
    })
    .select()
    .single();
  const { data: connId } = await admin.rpc("provision_channel_connection", {
    _company_id: company!.id,
    _channel_account_id: acct!.id,
    _provider: "bol",
    _secret_ref: `vault:bol/${crypto.randomUUID()}`,
  });
  const { data: sku } = await admin
    .from("catalog_skus")
    .insert({ company_id: company!.id, code: `ADP-${stamp}`, tracking_mode: "none", status: "active" })
    .select()
    .single();
  const externalListingId = `BOL-OFFER-${stamp}`;
  const { data: listing } = await alice.client
    .from("channel_listings")
    .insert({
      company_id: company!.id,
      channel_account_id: acct!.id,
      sku_id: sku!.id,
      external_listing_id: externalListingId,
      units_per_offer: 1,
      channel_cap: 500,
    })
    .select()
    .single();

  const setMode = async (mode: string, live_sync_enabled?: boolean) => {
    const patch: Record<string, unknown> = { mode };
    if (live_sync_enabled !== undefined) patch.live_sync_enabled = live_sync_enabled;
    const { error } = await admin.from("channel_connections").update(patch).eq("id", connId as string);
    if (error) throw error;
  };
  const killGlobal = async (writes_disabled: boolean) => {
    const { data: existing } = await admin
      .from("channel_kill_switches")
      .select("id")
      .eq("scope", "global")
      .is("connection_id", null)
      .maybeSingle();
    if (existing) {
      await admin.from("channel_kill_switches").update({ writes_disabled }).eq("id", existing.id);
    } else {
      await admin.from("channel_kill_switches").insert({ scope: "global", connection_id: null, writes_disabled });
    }
  };

  const enqueueStock = async (qty: number, reason = "test") => {
    const { data, error } = await alice.client.rpc("bol_enqueue_offer_stock_set", {
      _listing_id: listing!.id,
      _quantity: qty,
      _reason: reason,
    });
    if (error) throw error;
    return (data as any).event_id as string;
  };

  const resolver = makeExternalListingIdResolver(admin);

  // ── I.01 shadow mode → 0 HTTP calls, shadow row inserted
  {
    await setMode("shadow");
    await killGlobal(false);
    const evId = await enqueueStock(11, "shadow-test");
    const transport = new FakeTransport();
    tokenHandler(transport);
    transport.when(() => true, () => fakeResponse(500, { error: "should not be called" }));
    const adapter = makeAdapter(transport);
    const out = await runBolDispatchOnce(admin, adapter, acct!.id, resolver);
    check(
      "I.01 shadow: claimed=1 shadow_recorded=1 http_calls=0",
      out.claimed === 1 && out.shadow_recorded === 1 && out.http_calls === 0 && transport.callCount === 0,
      JSON.stringify(out),
    );
    const { data: shadow } = await admin
      .from("channel_shadow_dispatches")
      .select("event_id, event_type")
      .eq("event_id", evId)
      .maybeSingle();
    check("I.01b shadow row inserted", shadow?.event_type === "bol.offer.stock.set");
    const { data: ev } = await admin.from("outbox_events").select("status, attempts").eq("id", evId).single();
    check("I.01c outbox event delivered", ev?.status === "delivered", `status=${ev?.status}`);
  }

  // ── I.02 live mode → HTTP called, live row inserted
  {
    await setMode("live", true);
    await killGlobal(false);
    const evId = await enqueueStock(12, "live-test");
    const transport = new FakeTransport();
    tokenHandler(transport, "LIVE_TOK");
    transport.when(
      (c) => c.method === "PUT" && c.url.endsWith("/stock"),
      () => fakeResponse(202, { processStatusId: "psLIVE", status: "PENDING" }),
    );
    transport.when(
      (c) => c.method === "GET" && c.url.includes("/process-status/psLIVE"),
      () => fakeResponse(200, { processStatusId: "psLIVE", status: "SUCCESS", entityId: externalListingId, eventType: "STOCK_UPDATE" }),
    );
    const adapter = makeAdapter(transport);
    const out = await runBolDispatchOnce(admin, adapter, acct!.id, resolver);
    check(
      "I.02 live: live_delivered=1 http_calls>0",
      out.claimed === 1 && out.live_delivered === 1 && out.http_calls >= 3,
      JSON.stringify(out),
    );
    const { data: live } = await admin
      .from("channel_live_dispatches")
      .select("event_id, http_status, bol_process_status_id, external_ref")
      .eq("event_id", evId)
      .maybeSingle();
    check(
      "I.02b live row inserted with processStatusId",
      live?.http_status === 200 && live?.bol_process_status_id === "psLIVE",
      JSON.stringify(live),
    );
    const put = transport.calls.find((c) => c.method === "PUT")!;
    check(
      "I.02c PUT hit expected offer endpoint",
      put.url === `${BASE}/offers/${externalListingId}/stock`,
      put.url,
    );
  }

  // ── I.03 kill switch mid-live → defer, adapter NOT invoked
  {
    await setMode("live", true);
    await killGlobal(true);
    const evId = await enqueueStock(13, "kill-test");
    const transport = new FakeTransport();
    tokenHandler(transport);
    transport.when(() => true, () => {
      throw new Error("adapter should not be reachable when writes are blocked");
    });
    const adapter = makeAdapter(transport);
    const out = await runBolDispatchOnce(admin, adapter, acct!.id, resolver);
    check(
      "I.03 kill switch: deferred=1 http_calls=0",
      out.claimed === 1 && out.deferred === 1 && out.http_calls === 0 && transport.callCount === 0,
      JSON.stringify(out),
    );
    const { data: ev } = await admin
      .from("outbox_events")
      .select("status, attempts")
      .eq("id", evId)
      .single();
    check(
      "I.03b event back to pending, attempts NOT consumed",
      ev?.status === "pending" && ev?.attempts === 0,
      `status=${ev?.status} attempts=${ev?.attempts}`,
    );
    await killGlobal(false);
  }

  // ── I.04 transient 503 → event lands in failed with attempts=1
  {
    await setMode("live", true);
    await killGlobal(false);
    const evId = await enqueueStock(14, "transient-test");
    const transport = new FakeTransport();
    tokenHandler(transport);
    transport.when((c) => c.method === "PUT", () => fakeResponse(503, {}));
    const adapter = makeAdapter(transport);
    const out = await runBolDispatchOnce(admin, adapter, acct!.id, resolver);
    check(
      "I.04 transient 503 → failed_transient=1, live_delivered=0",
      out.failed_transient === 1 && out.live_delivered === 0,
      JSON.stringify(out),
    );
    const { data: ev } = await admin
      .from("outbox_events")
      .select("status, attempts, last_error")
      .eq("id", evId)
      .single();
    check(
      "I.04b event moved to failed status, attempts=1, error captured",
      ev?.status === "failed" && ev?.attempts === 1 && /transient/.test(String(ev?.last_error ?? "")),
      `status=${ev?.status} attempts=${ev?.attempts}`,
    );
    // reset next_attempt_at so DLQ test below can proceed quickly
    await admin.from("outbox_events").update({ next_attempt_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", evId);
  }

  // ── I.05 DLQ: repeat transient failures until dead_letter (max_attempts=8)
  {
    await setMode("live", true);
    await killGlobal(false);
    const evId = await enqueueStock(15, "dlq-test");
    // fail until dead_letter — max_attempts=8 by default so this loop runs
    // at most 8 times. Each pass resets next_attempt_at so the next claim
    // is not blocked by exponential backoff.
    let dispatched = 0;
    let lastStatus = "pending";
    for (let i = 0; i < 20; i++) {
      const transport = new FakeTransport();
      tokenHandler(transport);
      transport.when((c) => c.method === "PUT", () => fakeResponse(500, {}));
      const adapter = makeAdapter(transport);
      const out = await runBolDispatchOnce(admin, adapter, acct!.id, resolver);
      dispatched += out.claimed;
      const { data: ev } = await admin
        .from("outbox_events")
        .select("status, attempts, next_attempt_at")
        .eq("id", evId)
        .single();
      lastStatus = String(ev?.status ?? "");
      if (lastStatus === "dead_letter") break;
      // Advance the backoff so the next claim can happen
      await admin
        .from("outbox_events")
        .update({ next_attempt_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", evId);
    }
    check(
      "I.05 DLQ: repeated transient failures → dead_letter",
      lastStatus === "dead_letter",
      `final status=${lastStatus} after ${dispatched} dispatches`,
    );
    const { data: dl } = await admin
      .from("outbox_dead_letters")
      .select("event_id, reason")
      .eq("event_id", evId)
      .maybeSingle();
    check(
      "I.05b dead_letter row appended",
      dl?.event_id === evId && String(dl?.reason).includes("max_attempts"),
      JSON.stringify(dl),
    );
    const { data: ev } = await admin.from("outbox_events").select("attempts").eq("id", evId).single();
    check("I.05c attempts reached max_attempts (8)", ev?.attempts === 8, `attempts=${ev?.attempts}`);
  }

  await killGlobal(false);
}

async function main() {
  await runUnit();
  await runIntegration();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n===== Phase 4 M4 Adapter — ${passed}/${results.length} passed, ${failed} failed =====`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
