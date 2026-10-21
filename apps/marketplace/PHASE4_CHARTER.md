# Phase 4 — Bol Live Integration: Multi-Tenant Offers, Orders & FBR Fulfilment

**Status:** Charter authoritative baseline. Awaiting explicit `ابدأ M1` before opening migrations.
**Precedence:** Phase 4 does not modify or weaken any Phase 2 or Phase 3 guarantee. Where any Phase 4 text appears to conflict with Phase 2/3, Phase 2/3 wins and Phase 4 must be re-scoped.

---

## 1. Goal

Connect each seller (company) to their own Bol account, import their offers and orders, reserve inventory from the correct company, pick / pack / ship from our own (FBR) stock, and push stock / price / delivery-promise / tracking back to Bol reliably.

```
Bol account (per seller)
        ↕
   Central system
        ↕
Seller inventory → reservation → pick/pack → ship → tracking → Bol
```

## 2. Scope

**In scope**
- Secure per-tenant Bol connections (OAuth2 client-credentials, vault-backed secrets).
- Read-only import of Bol offers; EAN → internal product mapping; import review queue.
- Order polling with overlap; idempotent order + order-line ingestion.
- Reservation from the correct `company_id`; pick / pack / ship via existing Phase 2 fulfilment RPCs.
- Outbound sync of stock, price, fulfilment method, delivery promise through the Phase 3 outbox.
- FBR shipment confirmation with carrier + Track & Trace pushed to Bol.
- Reconciliation of local vs Bol per (`company_id`, `channel_account_id`, offer target).
- Operational dashboard: per-tenant errors, latency, drift, missing tracking.

**Out of scope (deferred to Phase 5+)**
- LVB / Fulfilment by Bol (Bol-owned inventory & warehouses).
- Shipping-via-bol / VVB / Bol-purchased labels.
- Direct integration with GOFO, Sendcloud, DPD, PostNL, or any external carrier API.
- Returns, invoicing, customer service.
- Publishing product content, or copying Bol images/descriptions as seller-owned.
- Amazon / eBay / Shopify.

## 3. Binding invariants

1. Every Bol interaction is scoped to a single `(company_id, channel_account_id)`. No cross-tenant read or write is possible, at DB, RPC, adapter, or outbox layer.
2. Bol credentials never touch DB rows, outbox events, audit rows, or logs. Only a non-sensitive `secret_ref` is persisted; actual client_id/client_secret/refresh material lives in the server-side vault.
3. Every new `channel_connection` starts in `mode = read_only_import`. `live_sync_enabled` defaults to `false`.
4. Live writes require BOTH: `channel_connections.mode = 'live'` AND `live_sync_enabled = true` for that specific account, AND the global kill switch off, AND the per-account kill switch off.
5. Once a `(company_id, channel_account_id, bol_offer_id)` is in live mode, the internal record is the source of truth for stock / price / delivery promise. Divergent Bol values produce **drift findings** via Phase 3 reconciliation; they never silently overwrite our data.
6. Internal offer identity is `(company_id, channel_account_id, bol_offer_id)`. EAN is a **matching hint only** and never establishes ownership.
7. Unknown product on import goes to `catalog_import_reviews`. No auto-publish, no auto-create of a live seller product.
8. Every Bol order item is ingested idempotently on `bol_order_item_id`. A second observation never creates a second reservation.
9. Bol shipment confirmation requires an existing internal shipment with a real carrier + tracking code. No confirmation without a physical shipment record.
10. Worker / adapter / reconciliation RPCs remain `service_role`-only, matching the Phase 3 baseline.
11. All outbound writes flow through the Phase 3 transactional outbox. No adapter code calls Bol write endpoints outside a claimed outbox event.
12. Rate limiting: adapter enforces steady flow, honours Bol `Retry-After` on 429, and never emits bursts. No unbounded parallelism per account.

## 4. Migrations

| # | Scope | Acceptance gate |
|---|---|---|
| **M1** | `channel_connections`, vault `secret_ref` model, `channel_sync_runs`, `channel_sync_cursors`, `channel_api_audit` (no payload secrets), `channel_kill_switches`; rate-limited Bol adapter in read-only mode. | Test connection succeeds against sandbox; no secret material in DB or logs; tenant isolation enforced; `anon` / `authenticated` cannot reach any worker/adapter RPC. |
| **M2** | Offer import: `external_offer_observations`, `merchant_offer_links`, `catalog_import_reviews`, `channel_import_runs`; EAN mapping; live reconciliation wiring to Phase 3 M3. | Import a sandbox account; no cross-tenant offer merge; duplicate import is a no-op; unknown product lands in review queue; same EAN across N sellers yields N merchant offers + 1 catalog reference. |
| **M3** | Orders: immutable `channel_order_inbox`, `channel_orders`, `channel_order_lines`, `channel_order_events`; per-line link to `merchant_offer_link` + `reservation_id`. | Idempotent on `bol_order_item_id`; cancel-before-ship releases reservation exactly once; partial ship / partial cancel supported at line level; cross-company order rejected; FBB items observed but do not enter internal pick/pack. |
| **M4** | Live outbound via Phase 3 outbox: `bol.offer.stock.set`, `bol.offer.price.set`, `bol.offer.fulfilment.set`, `bol.offer.delivery_promise.set`, `bol.offer.resync`; PATCH-only semantics; shadow vs live. | No direct adapter writes outside outbox; retry / DLQ; per-event idempotency; monotonic version enforced; kill switch halts writes immediately; `shadow` mode never calls Bol write endpoints. |
| **M5** | FBR shipping confirmation + tracking; ops dashboard. | No Bol shipment without internal shipment + tracking; tracking never sent twice; partial ship / partial cancel correct; replay does not duplicate confirmation; dashboard surfaces late orders, missing tracking, confirmation failures, delivery-promise breaches. |

## 5. Delivery promise

The system never invents a promise. Per Bol account we configure calendar, cutoff, allowed warehouse, operating days, carrier service, last realistic hand-off time, and NL / BE separately. The account's configured promise is what M4 pushes to Bol; performance against it is monitored, not fabricated.

## 6. Test bar

- ≥ **150 new tests** covering: RLS + tenant isolation per table & RPC, secret non-leak, import idempotency, same-EAN across multiple sellers, order polling replay & overlap, reservation lifecycle (create / release / cancel / partial ship), outbound version monotonicity, DLQ / retry / kill switch, shadow-mode non-write, live-mode only on enabled account, tracking idempotency, 429 backoff, reconciliation + resync, FBR vs FBB routing.
- All prior suites re-run **unchanged**: Phase 2 (153/153) + Phase 3 (122/122) = **275/275**. Any regression blocks the migration.

## 7. Closure criteria (`PHASE4_CLOSURE_REPORT.md`)

- All Phase 4 test suites green.
- Phase 2 + 3 = 275/275 unchanged.
- One real successful connection to a Bol **sandbox** seller account.
- Read-only import verified end-to-end and manually reviewed.
- Shadow mode documented with sample payloads.
- No live write occurred except on an explicitly enabled account.
- Full log of imports, shadow payloads, and outstanding errors.

## 8. Strategic decision (recorded)

Phase 4 stops at FBR + our own carriers. LVB / VVB / external carrier APIs are deferred to Phase 5. Mixing them now would blur the source of truth for stock and delivery promise and materially increase the risk of overselling and late shipments.

---

**Awaiting authorization** (`ابدأ M1`) before opening the first migration. Secret storage for Bol client credentials will be requested through the standard secret flow at the start of M1, not now — no code yet depends on them.
