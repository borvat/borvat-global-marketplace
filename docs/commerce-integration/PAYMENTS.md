# Payment Provider Port, webhook ingestion and reconciliation

Status: implemented against a **simulated** adapter only. No real PSP was called, no money moved, and nothing here is PSP acceptance. Milestone: M3 in [DELIVERY-PLAN](DELIVERY-PLAN.md).

## What exists

| Piece | File | Purpose |
|---|---|---|
| Payment Provider Port | `packages/commerce-server/payment-provider.mjs` | The only seam where a real PSP adapter plugs in. Contract is documented at the top of the file. |
| `SimulatedPaymentProvider` | same | Deterministic in-memory adapter, `simulated: true`, with test controls (settle, outage, signed webhook). Not for production wiring. |
| Shared payment state machine | `store.applyPaymentEvent` | One transition table for simulator, provider webhooks and reconciler. All validation precedes the first write. |
| Start payment | `store.startPayment` | Creates an idempotent intent (`order:<id>`). Requires all WMS portions reserved, no pending cancellation, unexpired reservation. Owner or admin only. |
| Webhook ingestion | `store.applyProviderWebhook` | Verifies signature over the raw body (HMAC-SHA256, 5 min tolerance, constant-time compare), normalizes the event, then ingests. |
| Exceptions | table `payment_exceptions`, `admin().paymentExceptions` | Events that cannot be applied cleanly are stored for an operator and acknowledged to the provider (2xx), never dropped. |
| Reconciler | `store.reconcilePayments` | Compares stuck `pending` payments with the provider's own view and converges them. Reports `release` for failed/cancelled so the caller frees WMS holds through `cancelUnpaid`. Surfaces paid-locally-but-not-at-provider drift without changing state. |

## HTTP routes

| Route | Auth | Notes |
|---|---|---|
| `POST /api/commerce/payments/webhook` | Signature only (no cookie, no Origin check) | 401 bad/stale signature, 400 bad payload, 503 if no provider or secret. 16 KiB body cap. |
| `POST /api/commerce/orders/:id/pay` | Session, owner or admin | Standard Origin and content-type rules. |
| `POST /api/commerce/admin/reconcile-payments` | Admin session | Releases WMS holds for failed/cancelled results and reports per-order release errors. |

Every route fails closed with `PAYMENT_PROVIDER_NOT_CONFIGURED` (503) unless `createCommerceHandler` receives `payments: { provider }`. `runtime.mjs` does not wire a provider, so the hosted test profile is unchanged.

## Exception kinds an operator can see

`INVALID_PAYMENT_TRANSITION` (for example success after a failed payment, which means money may have been received for a closed order), `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_REFERENCE_MISMATCH`, `UNKNOWN_ORDER`, `RESERVATION_NOT_CONFIRMED`, `ORDER_CANCELLATION_PENDING`, `CREDIT_NOT_CONFIRMED`. Reusing an event id with a different body is a hard `IDEMPOTENCY_CONFLICT` (409), not an exception.

## Verification

`node --test tests/commerce-server/*.test.mjs`: 31 pass (21 existing, 10 new in `payments.test.mjs`). The new suite was mutation-checked: disabling the signature comparison, the amount check, or the paid-drift report each makes a specific test fail.

## Not done, by design

- No real PSP adapter. Choosing the provider and its split/connect model (marketplace payouts) is an owner decision (D01–D08 in the operating model) and changes the adapter, not the port.
- No refund orchestration. `refund` exists on the port and the state machine has `refund_pending` and `refunded`, but a connected refund still needs WMS physical disposition, a native credit and a separate provider refund confirmation.
- No resolution workflow for `payment_exceptions` (the `resolved` flag exists, nothing sets it yet) and no alerting.
- Reconciler grace period is measured from order creation, not from intent creation, because `payments` has no timestamp column.
- Storage is still SQLite on a mounted volume: one instance, no horizontal scale. Moving to Postgres is a separate decision.
- No scheduler runs the reconciler; it is an admin-triggered call.
- Webhook secret handling: the secret is injected into the adapter by the caller. No secret is stored in the repository, and the tests use a synthetic value.

## Rollback

The change is additive: one new module, one nullable column (`payments.provider`, added by guarded `ALTER TABLE` on existing databases), one new table, three routes that fail closed without a configured provider. Reverting the commit leaves the extra column and table unused and harmless.
