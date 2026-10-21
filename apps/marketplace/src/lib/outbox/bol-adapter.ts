/**
 * BolChannelAdapter — Phase 4 M4 real outbound adapter (Bol Retailer API v11).
 *
 * Wire protocol (per user directive + Bol v11 docs):
 *  - Offer-level updates (fulfilment, delivery promise, resync/on-hold flag)
 *    use PATCH /offers/{id} with a partial body. Fields omitted from the body
 *    are left untouched by Bol. We never use PUT on the offer resource to
 *    avoid unintentionally rewriting fields we did not send.
 *  - Stock and price have dedicated sub-resources
 *    (PUT /offers/{id}/stock, PUT /offers/{id}/price) that are already
 *    scoped to a single concern and remain PUT per Bol v11.
 *  - All requests use the retailer v11 media type on both Content-Type and
 *    Accept.
 *  - Every mutation is asynchronous: Bol responds 202 with a
 *    `processStatusId`; we poll GET /process-status/{id} until terminal
 *    SUCCESS or FAILURE before we consider the call delivered.
 *
 * Classification:
 *  - 202 accepted, terminal SUCCESS       → return result (http_status=200)
 *  - 202 accepted, terminal FAILURE       → transient (retry via outbox)
 *  - 429                                   → transient, honours Retry-After
 *  - 5xx / network error / timeout         → transient
 *  - 400 / 404 / 422                       → permanent
 *  - 401 once                              → refresh token and retry once
 *  - anything else                         → transient (conservative)
 *
 * `plan(event)` is PURE and never touches the network — shadow mode uses it
 * as the code-level guarantee that shadow issues zero HTTP calls.
 */

import { Buffer } from "node:buffer";

export interface HttpResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<any>;
  text(): Promise<string>;
}
export type HttpTransport = (input: string, init: any) => Promise<HttpResponseLike>;

export type BolApiVersion = "v10" | "v11";

export interface BolAdapterOptions {
  baseUrl: string; // e.g. https://api.bol.com/retailer-demo or /retailer
  tokenUrl?: string; // default: https://login.bol.com/token
  clientId: string;
  clientSecret: string;
  /**
   * Bol Retailer API version this adapter speaks. Defaults to "v11".
   *  - "v11" → offer-level updates use PATCH /offers/{id} (partial body).
   *  - "v10" → offer-level updates use PUT /offers/{id} (documented v10 shape).
   * Stock and price always use their dedicated PUT sub-resources in both
   * versions. Only the media type and offer-level method change.
   */
  apiVersion?: BolApiVersion;
  transport?: HttpTransport;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  requestTimeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface EventInput {
  id: string;
  event_type: string;
  /** Bol offer id — resolved from channel_listings.external_listing_id */
  external_listing_id: string;
  payload: Record<string, any>;
  listing_version: number | string;
}

export interface PlannedRequest {
  method: "PUT" | "POST" | "PATCH";
  url: string;
  contentType: string;
  accept: string;
  body: Record<string, unknown>;
}

export interface BolCallResult {
  http_status: number;
  bol_process_status_id: string;
  external_ref: Record<string, unknown>;
  request_started_at: string;
  request_ended_at: string;
  http_call_count: number;
}

export class BolAdapterError extends Error {
  constructor(
    message: string,
    public readonly kind: "transient" | "permanent",
    public readonly retryAfterMs?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "BolAdapterError";
  }
}

const RETAILER_V10 = "application/vnd.retailer.v10+json";
const RETAILER_V11 = "application/vnd.retailer.v11+json";

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const secs = Number.parseInt(h, 10);
  return Number.isFinite(secs) ? secs * 1000 : undefined;
}

export class BolChannelAdapter {
  private tokenCache?: { token: string; expiresAt: number };
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** Count of real HTTP calls issued by this adapter instance. */
  public httpCallCount = 0;
  /** Count of `plan()` calls (pure planning; no HTTP). */
  public planCount = 0;

  constructor(private readonly opts: BolAdapterOptions) {
    this.transport =
      opts.transport ??
      (async (url, init) => {
        const r = await globalThis.fetch(url, init);
        return r as unknown as HttpResponseLike;
      });
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private get tokenUrl(): string {
    return this.opts.tokenUrl ?? "https://login.bol.com/token";
  }

  private endpoint(offerId: string, suffix: "" | "/stock" | "/price"): string {
    return `${this.opts.baseUrl}/offers/${encodeURIComponent(offerId)}${suffix}`;
  }

  /** Bol API version (defaults to "v11"). Controls media type and the
   *  offer-level method (PUT for v10, PATCH for v11). */
  private get apiVersion(): BolApiVersion {
    return this.opts.apiVersion ?? "v11";
  }
  private get mediaType(): string {
    return this.apiVersion === "v10" ? RETAILER_V10 : RETAILER_V11;
  }
  /** Method for offer-level (non-stock, non-price) updates. */
  private get offerMethod(): "PUT" | "PATCH" {
    return this.apiVersion === "v10" ? "PUT" : "PATCH";
  }

  /**
   * PURE. Deterministic mapping from outbox event → HTTP request. Never
   * invokes the network. Shadow mode calls this and stops here.
   */
  plan(event: EventInput): PlannedRequest {
    this.planCount++;
    const offer = event.external_listing_id;
    if (!offer) throw new BolAdapterError("event missing external_listing_id", "permanent");
    const p = event.payload ?? {};
    const mt = this.mediaType;
    const offerMethod = this.offerMethod;
    switch (event.event_type) {
      case "bol.offer.stock.set": {
        const amount = Number(p.quantity);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new BolAdapterError("stock payload missing valid quantity", "permanent");
        }
        return {
          method: "PUT",
          url: this.endpoint(offer, "/stock"),
          contentType: mt,
          accept: mt,
          body: { amount, managedByRetailer: true },
        };
      }
      case "bol.offer.price.set": {
        const cents = Number(p.price_cents);
        if (!Number.isFinite(cents) || cents <= 0) {
          throw new BolAdapterError("price payload missing valid price_cents", "permanent");
        }
        return {
          method: "PUT",
          url: this.endpoint(offer, "/price"),
          contentType: mt,
          accept: mt,
          body: { pricing: { bundlePrices: [{ quantity: 1, unitPrice: cents / 100 }] } },
        };
      }
      case "bol.offer.fulfilment.set": {
        const method = String(p.method ?? "");
        if (method !== "FBR") {
          throw new BolAdapterError(`phase 4 supports FBR only (got ${method})`, "permanent");
        }
        return {
          method: offerMethod,
          url: this.endpoint(offer, ""),
          contentType: mt,
          accept: mt,
          body: { fulfilment: { method: "FBR" } },
        };
      }
      case "bol.offer.delivery_promise.set": {
        const promise = (p.promise ?? {}) as Record<string, any>;
        const deliveryCode = String(promise.deliveryCode ?? "");
        if (!deliveryCode) {
          throw new BolAdapterError("delivery promise missing deliveryCode", "permanent");
        }
        return {
          method: offerMethod,
          url: this.endpoint(offer, ""),
          contentType: mt,
          accept: mt,
          body: { fulfilment: { method: "FBR", deliveryCode } },
        };
      }
      case "bol.offer.resync": {
        return {
          method: offerMethod,
          url: this.endpoint(offer, ""),
          contentType: mt,
          accept: mt,
          body: { onHoldByRetailer: false },
        };
      }
      case "bol.shipment.confirm": {
        // Phase 4 M5 — FBR shipment confirmation. Uses POST /shipments
        // (stable endpoint across v10/v11; async 202 + processStatusId).
        const orderItemId = String(p.order_item_id ?? "");
        const transporterCode = String(p.transporter_code ?? "");
        if (!orderItemId) {
          throw new BolAdapterError("shipment.confirm payload missing order_item_id", "permanent");
        }
        if (!transporterCode) {
          throw new BolAdapterError("shipment.confirm payload missing transporter_code", "permanent");
        }
        const transport: Record<string, unknown> = { transporterCode };
        if (typeof p.track_and_trace === "string" && p.track_and_trace.length > 0) {
          transport.trackAndTrace = String(p.track_and_trace);
        }
        return {
          method: "POST",
          url: this.opts.baseUrl.replace(/\/$/, "") + "/shipments",
          contentType: mt,
          accept: mt,
          body: { orderItems: [{ orderItemId }], transport },
        };
      }
      case "bol.shipment.cancel": {
        // §3.3 gate: Bol v11 exposes no pre-handover cancel — deferred from M5.
        throw new BolAdapterError(
          "bol.shipment.cancel deferred from M5 (no Bol endpoint documented)",
          "permanent",
        );
      }
      default:
        throw new BolAdapterError(`unsupported event_type ${event.event_type}`, "permanent");
    }
  }

  private async callHttp(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<HttpResponseLike> {
    this.httpCallCount++;
    const timeout = this.opts.requestTimeoutMs ?? 20_000;
    return await Promise.race([
      this.transport(url, { method, headers, body }),
      new Promise<HttpResponseLike>((_, rej) =>
        setTimeout(
          () => rej(new BolAdapterError(`request timeout after ${timeout}ms`, "transient")),
          timeout,
        ),
      ),
    ]);
  }

  private async getToken(force = false): Promise<string> {
    if (!force && this.tokenCache && this.tokenCache.expiresAt > this.now() + 60_000) {
      return this.tokenCache.token;
    }
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString(
      "base64",
    );
    const r = await this.callHttp(
      "POST",
      this.tokenUrl,
      {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      "grant_type=client_credentials",
    );
    if (r.status === 429) {
      throw new BolAdapterError(
        "token endpoint 429",
        "transient",
        parseRetryAfter(r.headers.get("Retry-After")),
      );
    }
    if (!r.ok) {
      throw new BolAdapterError(
        `token http ${r.status}`,
        r.status >= 500 ? "transient" : "permanent",
      );
    }
    const j = await r.json();
    const token = String(j?.access_token ?? "");
    if (!token) throw new BolAdapterError("token endpoint missing access_token", "permanent");
    const ttlSec = Number(j?.expires_in ?? 300);
    this.tokenCache = { token, expiresAt: this.now() + ttlSec * 1000 };
    return token;
  }

  async dispatchLive(event: EventInput): Promise<BolCallResult> {
    const plan = this.plan(event);
    const startCount = this.httpCallCount;
    const request_started_at = new Date().toISOString();

    let token = await this.getToken();
    let r = await this.callHttp(plan.method, plan.url, this.authHeaders(token, plan), JSON.stringify(plan.body));
    if (r.status === 401) {
      token = await this.getToken(true);
      r = await this.callHttp(plan.method, plan.url, this.authHeaders(token, plan), JSON.stringify(plan.body));
    }
    this.classifyOrThrow(r);
    if (r.status !== 202) {
      throw new BolAdapterError(`unexpected accept status ${r.status}`, "transient");
    }

    const accepted = await r.json();
    const psid = String(accepted?.processStatusId ?? accepted?.id ?? "");
    if (!psid) throw new BolAdapterError("bol response missing processStatusId", "transient", undefined, accepted);

    // Prefer the HATEOAS self link Bol returns (Bol Demo serves process-status
    // under /shared-demo/process-status/... instead of the base path). Fall
    // back to a base-URL join when no link is provided. We accept only
    // api.bol.com hosts to prevent host redirection abuse.
    const selfLink = String(
      (Array.isArray(accepted?.links) &&
        accepted.links.find((l: any) => l?.rel === "self" && typeof l?.href === "string")
          ?.href) ||
        "",
    );
    let psUrl = `${this.opts.baseUrl}/process-status/${encodeURIComponent(psid)}`;
    try {
      if (selfLink) {
        const parsed = new URL(selfLink);
        if (parsed.hostname === "api.bol.com") psUrl = parsed.toString();
      }
    } catch {
      /* keep fallback psUrl */
    }
    const interval = this.opts.pollIntervalMs ?? 500;
    const deadline = this.now() + (this.opts.pollTimeoutMs ?? 60_000);

    let final: any = accepted;
    // Terminal-state polling loop.
    while (true) {
      if (this.now() > deadline) {
        throw new BolAdapterError(
          `process-status poll timeout (id=${psid})`,
          "transient",
          undefined,
          { processStatusId: psid },
        );
      }
      const s = await this.callHttp("GET", psUrl, {
        Authorization: `Bearer ${token}`,
        Accept: this.mediaType,
      });
      if (s.status === 401) {
        token = await this.getToken(true);
        continue;
      }
      if (s.status === 429) {
        await this.sleep(parseRetryAfter(s.headers.get("Retry-After")) ?? interval);
        continue;
      }
      if (s.status >= 500) {
        await this.sleep(interval);
        continue;
      }
      if (!s.ok) {
        throw new BolAdapterError(`process-status http ${s.status}`, "transient");
      }
      const body = await s.json();
      final = body;
      const st = String(body?.status ?? "").toUpperCase();
      if (st === "SUCCESS") break;
      if (st === "FAILURE") {
        throw new BolAdapterError(
          `bol process FAILURE: ${body?.errorMessage ?? body?.description ?? "unknown"}`,
          "transient",
          undefined,
          body,
        );
      }
      // PENDING / TIMEOUT / other non-terminal → wait and poll again.
      await this.sleep(interval);
    }

    const request_ended_at = new Date().toISOString();
    return {
      http_status: 200,
      bol_process_status_id: psid,
      external_ref: {
        processStatusId: psid,
        entityId: final?.entityId ?? null,
        eventType: final?.eventType ?? null,
        finalStatus: final?.status ?? "SUCCESS",
      },
      request_started_at,
      request_ended_at,
      http_call_count: this.httpCallCount - startCount,
    };
  }

  private authHeaders(token: string, plan: PlannedRequest): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": plan.contentType,
      Accept: plan.accept,
    };
  }

  private classifyOrThrow(r: HttpResponseLike): void {
    if (r.status === 429) {
      throw new BolAdapterError(
        "bol 429",
        "transient",
        parseRetryAfter(r.headers.get("Retry-After")),
      );
    }
    if (r.status >= 500) throw new BolAdapterError(`bol http ${r.status}`, "transient");
    if ([400, 404, 422].includes(r.status)) {
      throw new BolAdapterError(`bol http ${r.status}`, "permanent");
    }
  }

  /** Test hook — inject/replace the cached OAuth token. */
  _debugSetToken(token: string, ttlSec = 300) {
    this.tokenCache = { token, expiresAt: this.now() + ttlSec * 1000 };
  }
}
