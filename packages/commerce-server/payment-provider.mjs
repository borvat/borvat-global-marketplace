/**
 * Payment Provider Port (provider-agnostic) plus a clearly labelled SIMULATED adapter.
 *
 * The port is the only place a real PSP (Mollie, Adyen, Stripe, ...) will be plugged in.
 * No adapter here moves real money, and nothing in this file proves PSP acceptance.
 *
 * Port contract (all methods async except parseWebhook/verifyWebhook, which are pure):
 *   name:      string, stable provider id used in audit trails
 *   simulated: boolean, true for adapters that never touch a real provider
 *   createIntent({ orderId, amountCents, currency, idempotencyKey }) -> { reference, status }
 *   fetchStatus(reference) -> { reference, status, amountCents, currency }
 *   refund({ reference, amountCents, idempotencyKey }) -> { reference, status }
 *   verifyWebhook({ rawBody, headers, now }) -> void | throws PaymentProviderError
 *   parseWebhook(rawBody) -> { eventId, orderId, reference, status, amountCents, currency }
 *
 * Normalized statuses match the store's payment state machine:
 *   pending | failed | cancelled | succeeded | refund_pending | refunded
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PROVIDER_STATUSES = Object.freeze([
  "pending",
  "failed",
  "cancelled",
  "succeeded",
  "refund_pending",
  "refunded",
]);

export class PaymentProviderError extends Error {
  constructor(code, { retryable = false } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

const SIGNATURE_HEADER = "x-borvat-signature";
const TIMESTAMP_HEADER = "x-borvat-timestamp";
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

/** Generic scheme used by the simulated adapter: HMAC-SHA256 over "<timestamp>.<rawBody>". */
export function signWebhook(secret, timestamp, rawBody) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function verifyWebhookSignature({
  secret,
  rawBody,
  headers,
  now = Date.now,
  toleranceMs = WEBHOOK_TOLERANCE_MS,
}) {
  if (typeof secret !== "string" || secret.length < 16)
    throw new PaymentProviderError("WEBHOOK_SECRET_NOT_CONFIGURED");
  if (typeof rawBody !== "string")
    throw new PaymentProviderError("WEBHOOK_BODY_INVALID");
  const get = (name) =>
    typeof headers?.get === "function" ? headers.get(name) : headers?.[name];
  const timestamp = get(TIMESTAMP_HEADER);
  const signature = get(SIGNATURE_HEADER);
  if (!/^\d{10,16}$/.test(timestamp ?? "") || !/^[0-9a-f]{64}$/.test(signature ?? ""))
    throw new PaymentProviderError("WEBHOOK_SIGNATURE_INVALID");
  if (Math.abs(now() - Number(timestamp)) > toleranceMs)
    throw new PaymentProviderError("WEBHOOK_TIMESTAMP_OUT_OF_TOLERANCE");
  const expected = Buffer.from(signWebhook(secret, timestamp, rawBody), "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new PaymentProviderError("WEBHOOK_SIGNATURE_INVALID");
}

const positiveInt = (value) =>
  Number.isSafeInteger(value) && value > 0 ? value : null;

/** Shared, strict normalization of a webhook body into the port's event shape. */
export function normalizeEvent(raw) {
  const text = (v, max = 128) =>
    typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v) && v.length <= max
      ? v
      : null;
  const event = {
    eventId: text(raw?.eventId),
    orderId: text(raw?.orderId),
    reference: text(raw?.reference),
    status: PROVIDER_STATUSES.includes(raw?.status) ? raw.status : null,
    amountCents: positiveInt(raw?.amountCents),
    currency: raw?.currency === "EUR" ? "EUR" : null,
  };
  if (Object.values(event).some((v) => v === null))
    throw new PaymentProviderError("WEBHOOK_PAYLOAD_INVALID");
  return event;
}

/**
 * SIMULATED adapter: deterministic, in-memory, test/staging only.
 * It exists so the order core, webhook ingestion and reconciler can be exercised
 * end-to-end; it is NOT evidence that any real PSP works.
 */
export class SimulatedPaymentProvider {
  name = "simulated";
  simulated = true;
  #secret;
  #now;
  #intents = new Map(); // reference -> intent
  #byKey = new Map(); // idempotencyKey -> reference
  #down = false;

  constructor({ webhookSecret, now = Date.now } = {}) {
    this.#secret = webhookSecret;
    this.#now = now;
  }

  async createIntent({ orderId, amountCents, currency, idempotencyKey }) {
    this.#guard();
    if (!positiveInt(amountCents) || currency !== "EUR")
      throw new PaymentProviderError("INTENT_INVALID");
    const known = this.#byKey.get(idempotencyKey);
    if (known) {
      const old = this.#intents.get(known);
      if (old.orderId !== orderId || old.amountCents !== amountCents)
        throw new PaymentProviderError("IDEMPOTENCY_CONFLICT");
      return { reference: old.reference, status: old.status };
    }
    const reference = "sim_" + randomUUID().replace(/-/g, "");
    this.#intents.set(reference, {
      reference,
      orderId,
      amountCents,
      currency,
      status: "pending",
    });
    this.#byKey.set(idempotencyKey, reference);
    return { reference, status: "pending" };
  }

  async fetchStatus(reference) {
    this.#guard();
    const intent = this.#intents.get(reference);
    if (!intent) throw new PaymentProviderError("REFERENCE_UNKNOWN");
    return {
      reference,
      status: intent.status,
      amountCents: intent.amountCents,
      currency: intent.currency,
    };
  }

  async refund({ reference }) {
    this.#guard();
    const intent = this.#intents.get(reference);
    if (!intent || intent.status !== "succeeded")
      throw new PaymentProviderError("REFUND_NOT_ALLOWED");
    intent.status = "refunded";
    return { reference, status: "refunded" };
  }

  verifyWebhook({ rawBody, headers, now = this.#now }) {
    verifyWebhookSignature({ secret: this.#secret, rawBody, headers, now });
  }

  parseWebhook(rawBody) {
    let raw;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      throw new PaymentProviderError("WEBHOOK_PAYLOAD_INVALID");
    }
    return normalizeEvent(raw);
  }

  // ---- test controls (not part of the port) ----
  settle(reference, status) {
    const intent = this.#intents.get(reference);
    if (!intent) throw new PaymentProviderError("REFERENCE_UNKNOWN");
    intent.status = status;
  }
  setOutage(down) {
    this.#down = !!down;
  }
  signedWebhook(event, timestamp = this.#now()) {
    const rawBody = JSON.stringify(event);
    return {
      rawBody,
      headers: {
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signWebhook(this.#secret, String(timestamp), rawBody),
      },
    };
  }
  #guard() {
    if (this.#down)
      throw new PaymentProviderError("PROVIDER_UNAVAILABLE", { retryable: true });
  }
}
