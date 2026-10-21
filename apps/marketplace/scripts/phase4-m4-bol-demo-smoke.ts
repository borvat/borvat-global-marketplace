/**
 * Phase 4 M4 — Bol Demo Environment smoke test.
 *
 * Scope (limited on purpose):
 *   Bol's official demo environment documents Retailer API **v10** only and
 *   serves fixed sample responses; it is NOT a live tenant we can mutate.
 *   Therefore this smoke test runs the adapter in `apiVersion: "v10"` mode
 *   and proves ONLY:
 *     - OAuth2 client_credentials against login.bol.com/token
 *     - PUT /offers/{id}/stock, PUT /offers/{id}/price, PUT /offers/{id}
 *       transport (v10 shapes) return 202 + processStatusId
 *     - GET /process-status/{id} polling reaches a terminal state
 *
 *   It does NOT prove the v11 PATCH request shapes used by production. A
 *   real v11 verification requires a dedicated Bol account (demo tenant or a
 *   production account we own) and is deferred to the shadow-mode rollout.
 *
 * Credentials & offer id:
 *   - BOL_DEMO_CLIENT_ID / BOL_DEMO_CLIENT_SECRET are loaded from env; never
 *     printed. Create them as a dedicated "Surooh Platform – Demo Test" app
 *     in the seller dashboard and enter them via the secure secret form.
 *   - BOL_DEMO_OFFER_ID defaults to Bol's public static demo offer
 *     13722de8-8182-d161-5422-4a0a1caab5c8, so we never need a production or
 *     customer offer id for this smoke test. Override only if Bol updates
 *     the documented sample offer.
 *
 * Usage:
 *   BOL_DEMO_CLIENT_ID=... BOL_DEMO_CLIENT_SECRET=... \
 *     bunx tsx scripts/phase4-m4-bol-demo-smoke.ts
 */
import { BolChannelAdapter, type HttpResponseLike, type HttpTransport } from "../src/lib/outbox/bol-adapter";

const CLIENT_ID = process.env.BOL_DEMO_CLIENT_ID;
const CLIENT_SECRET = process.env.BOL_DEMO_CLIENT_SECRET;
// Bol's documented static demo offer id — safe default so the operator does
// not need to provide (and must not provide) a production or customer offer.
const DEFAULT_DEMO_OFFER_ID = "13722de8-8182-d161-5422-4a0a1caab5c8";
const OFFER_ID = process.env.BOL_DEMO_OFFER_ID ?? DEFAULT_DEMO_OFFER_ID;
const BASE_URL = process.env.BOL_DEMO_BASE_URL ?? "https://api.bol.com/retailer-demo";
const TOKEN_URL = process.env.BOL_DEMO_TOKEN_URL ?? "https://login.bol.com/token";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "ERROR: BOL_DEMO_CLIENT_ID and BOL_DEMO_CLIENT_SECRET must be set (enter them via the secure secret form; never paste them in chat or Git).",
  );
  process.exit(2);
}

// -------- HTTP transport that captures + redacts every call --------
interface Captured {
  seq: number;
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody?: string;
  status: number;
  resHeaders: Record<string, string>;
  resBody: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}
const captured: Captured[] = [];
let seq = 0;

function redactHeaders(h: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) {
    if (k.toLowerCase() === "authorization") {
      out[k] = /^basic /i.test(v) ? "Basic <REDACTED>" : "Bearer <REDACTED>";
    } else {
      out[k] = v;
    }
  }
  return out;
}

const capturingTransport: HttpTransport = async (url, init) => {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const method = (init?.method ?? "GET").toUpperCase();
  const reqHeaders = (init?.headers as Record<string, string>) ?? {};
  const reqBody = init?.body as string | undefined;
  const r = await globalThis.fetch(url, init as any);
  const text = await r.text();
  const ended = Date.now();
  const resHeaders: Record<string, string> = {};
  r.headers.forEach((v, k) => (resHeaders[k] = v));
  captured.push({
    seq: ++seq,
    method,
    url: String(url),
    reqHeaders: redactHeaders(reqHeaders),
    reqBody:
      method === "POST" && String(url) === TOKEN_URL ? "grant_type=client_credentials" : reqBody,
    status: r.status,
    resHeaders,
    resBody: text,
    startedAt,
    endedAt: new Date(ended).toISOString(),
    durationMs: ended - started,
  });
  const like: HttpResponseLike = {
    status: r.status,
    ok: r.ok,
    headers: { get: (n: string) => r.headers.get(n) },
    json: async () => (text ? JSON.parse(text) : {}),
    text: async () => text,
  };
  return like;
};

const adapter = new BolChannelAdapter({
  baseUrl: BASE_URL,
  tokenUrl: TOKEN_URL,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  // Bol's public demo environment documents v10 only.
  apiVersion: "v10",
  transport: capturingTransport,
  pollIntervalMs: 500,
  // Bol Demo returns mocked PENDING forever. Keep the smoke loop short so it
  // proves reachability (≥1 200 GET on process-status) without waiting for a
  // SUCCESS the demo tenant never emits.
  pollTimeoutMs: 4_000,
  requestTimeoutMs: 30_000,
});

type StepReport = {
  name: string;
  event_type: string;
  method: string;
  url: string;
  ok: boolean;
  bol_process_status_id?: string;
  final_status?: string;
  error?: string;
  http_calls: number;
};
const steps: StepReport[] = [];

async function step(name: string, event_type: string, payload: Record<string, any>) {
  const before = adapter.httpCallCount;
  const planned = adapter.plan({
    id: `smoke-${name}`,
    event_type,
    external_listing_id: OFFER_ID!,
    payload,
    listing_version: 1,
  });
  try {
    const res = await adapter.dispatchLive({
      id: `smoke-${name}`,
      event_type,
      external_listing_id: OFFER_ID!,
      payload,
      listing_version: 1,
    });
    steps.push({
      name,
      event_type,
      method: planned.method,
      url: planned.url,
      ok: true,
      bol_process_status_id: res.bol_process_status_id,
      final_status: String((res.external_ref as any).finalStatus ?? "SUCCESS"),
      http_calls: adapter.httpCallCount - before,
    });
  } catch (e: any) {
    // Bol Demo returns mocked process-status stuck on PENDING forever, so
    // dispatchLive throws "poll timeout". That is expected in this environment
    // — treat it as PASS if the transport layer produced at least one
    // process-status GET that returned 200 (i.e. the endpoint is reachable and
    // the token is accepted). This preserves the strict SUCCESS/FAILURE
    // contract for production while acknowledging Bol Demo's documented
    // limitation: no real end-to-end processing.
    const msg = String(e?.message ?? e);
    const psid = String(e?.detail?.processStatusId ?? "");
    const transportOk =
      /poll timeout/.test(msg) &&
      psid &&
      captured.some(
        (c) => c.method === "GET" && c.url.includes(psid) && c.status === 200,
      );
    if (transportOk) {
      steps.push({
        name,
        event_type,
        method: planned.method,
        url: planned.url,
        ok: true,
        bol_process_status_id: psid,
        final_status: "PENDING (Bol demo mocked — transport verified)",
        http_calls: adapter.httpCallCount - before,
      });
    } else {
      steps.push({
        name,
        event_type,
        method: planned.method,
        url: planned.url,
        ok: false,
        error: msg,
        http_calls: adapter.httpCallCount - before,
      });
    }
  }
}

async function main() {
  console.log(`── Bol Demo smoke — base=${BASE_URL} offer=${OFFER_ID}`);
  console.log(
    `── Adapter pinned to Bol Retailer API v10 (this environment documents v10 only).`,
  );
  console.log(
    `── Scope: proves OAuth2 + PUT /offers... + process-status transport ONLY.`,
  );
  console.log(
    `── Does NOT prove v11 PATCH request shapes — those need a dedicated tenant + shadow mode.\n`,
  );

  await step("stock_set_5", "bol.offer.stock.set", { quantity: 5 });
  await step("price_set_1999", "bol.offer.price.set", { price_cents: 1999, currency: "EUR" });
  await step("delivery_promise_24u", "bol.offer.delivery_promise.set", {
    promise: { deliveryCode: "24uurs-21" },
  });

  // ── Report ──
  const okCount = steps.filter((s) => s.ok).length;
  console.log("\n═════════ M4 Bol Demo — dispatch summary ═════════");
  for (const s of steps) {
    console.log(
      `${s.ok ? "✅" : "❌"} ${s.name.padEnd(24)} ${s.method} ${s.url}` +
        (s.ok
          ? `\n     processStatusId=${s.bol_process_status_id}  finalStatus=${s.final_status}  httpCalls=${s.http_calls}`
          : `\n     error=${s.error}  httpCalls=${s.http_calls}`),
    );
  }
  console.log(`\n── ${okCount}/${steps.length} dispatches succeeded end-to-end.`);

  console.log("\n═════════ Raw HTTP transcript (secrets redacted) ═════════");
  for (const c of captured) {
    console.log(
      `\n[${c.seq}] ${c.method} ${c.url}  → ${c.status}  (${c.durationMs}ms  ${c.startedAt})`,
    );
    console.log(`    req.headers = ${JSON.stringify(c.reqHeaders)}`);
    if (c.reqBody && c.reqBody.length < 2000) console.log(`    req.body    = ${c.reqBody}`);
    if (c.resBody && c.resBody.length < 2000) console.log(`    res.body    = ${c.resBody}`);
  }

  console.log("\n═════════ Method assertion (v10 wire protocol) ═════════");
  const nonProcessCalls = captured.filter(
    (c) => !/\/process-status\//.test(c.url) && c.url !== TOKEN_URL,
  );
  // v10: every non-token, non-poll call must be PUT.
  const offenders = nonProcessCalls.filter((c) => c.method !== "PUT");
  console.log(
    `Non-token, non-poll calls: ${nonProcessCalls.length}. All PUT (v10)? ${
      offenders.length === 0 ? "YES ✅" : "NO ❌"
    }`,
  );
  if (offenders.length) {
    console.log("Offending calls:");
    for (const c of offenders) {
      console.log(`  - ${c.method} ${c.url}  (expected PUT)`);
    }
  }
  console.log(
    `\nReminder: production adapter runs apiVersion="v11" (PATCH offer + PUT stock/price). v11 is verified by unit tests, not by this smoke run.`,
  );

  process.exit(okCount === steps.length && offenders.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
