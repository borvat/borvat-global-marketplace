# Adapter contracts — test only, no production destinations

These are internal interfaces, not exposed browser APIs. All requests include `command_id` UUID, `idempotency_key`, `company_id` UUID, `operator_entity_id` UUID, `correlation_id`, `schema_version=1`, and `mode=test`. Authenticate with audience-bound, least-privilege service credentials. Receiver validates company/resource ownership; company_id is not authority. Same command and payload returns same outcome; key with different hash returns conflict. The outbox is the transport authority.

## Warehouse v1

`reserve(items[{order_line_id,sku_id,quantity,origin_id}], expires_at)` → `{reservation_id,status:held|rejected,items[{line_id,allocated_quantity}],expires_at,reason_code?}`. Atomic all-or-none for MVP seller checkout. Reject insufficient stock without partial silently charged order. Warehouse owns quantity and concurrent allocation. quote may read availability but cannot reserve implicitly.

`commit(reservation_id,order_id,payment_confirmation_ref)` → `{reservation_id,status:committed|expired|rejected,version}`. Expired response routes late-payment compensation. Server verifies payment confirmation is from payment module, never client JSON.

`release(reservation_id,reason,expected_version)` → `{status:released|already_released|not_releasable,version}`. Consumed stock cannot be released as if unshipped. `getReservation` reconciles unknown outcomes before retry.

`createFulfilment(seller_order_id,items,reservation_id,delivery_snapshot_ref)` → `{fulfilment_id,status}`. Progress events include item quantities and immutable external refs. `receiveReturn(return_id,items[{line_id,quantity,disposition:quarantine|resalable|damaged}])` → receipt/disposition event; physical receipt does not mark PSP refund successful. No stock writes through SAM or marketplace offer-price commands.

## Accounting v1

`exportDocument(entity_id,source_event_id,kind,order_ref,document_date,currency,lines[{source_line_id,description,quantity,net_minor,tax_minor,gross_minor,tax_treatment_version}],original_document_ref?,provider_movement_refs[])` → `{export_id,status:accepted|pending|rejected,accounting_document_id?,invoice_number?,reason?}`. Validate totals and tax treatment in accounting; invoice number allocated once there. Buyers' goods documents belong to seller, platform fee document belongs to approved operator/seller service relationship. Self-billing requires explicit agreement, not assumed here.

`getExport(export_id)` provides status after timeout. Replayed source_event_id cannot create a new invoice. Credits reference original invoice and original line allocation. Existing e-Boekhouden connector remains read-only: use an isolated accounting test adapter. Future permitted writes need a separate connector permission decision; no assumption that current connector can post.

## SAM v1

Read tools: `get_marketplace_health(company_scope,from,to)`, `get_seller_performance(company_id,period)`, `get_reconciliation_exceptions(company_id)` return facts with source IDs, timestamps and confidence/unknown fields; no other company's PII, credentials or KYB documents.

Command tools generate proposals through `/sam/commands`: resource, current version, reason, expected effect, approval requirement, expiring approval bound to principal/company/action/body hash. Only ordinary permitted operations can later reach domain command handlers. Price, purchase, money, user permissions and production publication remain locked in this mission. No `mark_paid`, `force_payout`, direct SQL tool or service-role token to SAM. Verification reads domain and external evidence; executor success is not itself verification. A stale approval cannot authorize a changed price/body or different company.

## Carrier v1

MVP may accept staff-entered tracking through a real persisted authorized command, with recorded carrier and validated code/link. Carrier adapter sandbox may emit signed/deduplicated tracking events `{provider_event_id,shipment_id,status,event_time,items,proof_ref?}`. Delivery proof provenance is retained; a staff estimate is not silently promoted to carrier-delivered fact. Label purchasing or carrier booking is out of current authorization. A test label/mock tracking does not certify live carrier integration.

## Payment v1

Adapter methods: `createHostedOnboarding(provider_account)`, `createHostedCheckout(checkout_attempt,quote_snapshot,connected_account_id,application_fee_minor,idempotency_key)`, `getPayment(provider_account,payment_ref)`, `requestRefund(payment_ref,allocation,application_fee_refund_policy,key)`, `getRefund`, `listBalanceMovements(account,cursor)`, `listPayouts(account,cursor)`. Only test mode in this mission. Secrets server-only. Validate provider response mode/account/amount/currency and persist reference before any claim of completion.

Never put network calls inside a long database transaction. Persist intent, dispatch, then record provider evidence. Idempotency retention must outlast retries and provider uncertainty; provider key TTL alone is not durable dedup. After timeout search/re-fetch correlated provider object before making another financial request. Store original request hash and unique external IDs. Webhooks are hints to reconcile authoritative status, protected by raw signature and replay/account validation.

## Shared errors and recovery

`UNAUTHORIZED` no retry without credential fix; `SCOPE_MISMATCH` security incident/deny; `VERSION_CONFLICT` refresh/replan; `VALIDATION_FAILED` no retry unchanged; `INSUFFICIENT_STOCK` show buyer and release holds; `DEPENDENCY_TIMEOUT` unknown effect, reconcile before retry; `RATE_LIMITED` honor retry-after; `DUPLICATE` return original resource; `PERMANENT_FAILURE` DLQ + visible responsible team. Retries bounded, jittered, with a max age and owner. Dead letters never disappear from health reporting. Test cancellation, duplicate delivery and out-of-order callbacks for every adapter.
