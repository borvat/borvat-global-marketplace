# Delivery state — 2026-10-24

**Engineering checkpoint delivered; full project OPEN.** Nothing merged into main or released to production.

Current application source: `f98fa386529694ca721211bce389f050e642adfc`, branch
`implementation/server-orders-2026-10-24`, Draft PR34 stacked on PR33.
Existing paid isolated preview: https://borvat-marketplace-preview-paid.onrender.com/discover
Render deploy `dep-dbe3u6favr4c73a0l8o0`, LIVE2026-10-24T05:17:14.396620Z.
No new plan/service/database/disk/provider purchase. Automatic deploy remains OFF.

## Results, with separate proof boundaries

|Area|Actual result|Limit / next acceptance|
|---|---|---|
|Server orders, guest cookie, server quotes/prices, seller/admin roles and current authorization|Implemented and SQLite/real compiled HTTP tested, including restart, foreign guest/seller denial and approval revocation|Local connected-test only; public Render profile still browser demonstration. Cross-device guest recovery/login not complete|
|Native WMS/Accounting cycle|11 BORVAT native cases PASS on31e2db7, real fresh two-site ERPNext/Frappe16.52.0+MariaDB11.8.9; original native regression55PASS|Native test receiver0.1 only, one-unit EUR20 zero-tax mappings; not certification of separate Accounting invoice-workbench HTTP/UI or production contracts|
|Multi-company order|Native reservations, pick/pack, delivery documents, two invoices/receipts, partial returns to quarantine, two credits/refund entries and balanced native GL verified|No real carrier, physical delivery, PSP settlement, commercial taxes/fees/shipping-charge mapping; Marketplace partial shipment orchestration open|
|Retry / concurrency / cancellation|Last native unit:1reserve/1reject. Actual SIGKILL after remote commit:1dispatch/1reservation after restart. Failed simulated payment releases native hold once; controlled-clock unpaid expiry releases native hold|Manual bounded sweep only; no hosted scheduler or real delayed PSP reconciliation|
|Compiled application|3 HTTP/SSR cases PASS on31e2db7, including secure checkout/native reservation, restart retention and Arabic SSR/route guards|No rendered connected buyer/seller/admin acceptance|
|Client retry hardening|4 fake-transport tests within44PASS component suite onf98fa386; lost ACK/address edit retains identity, expired quote needs reconfirmation, malformed ACK cannot confirm, cleanup failure cannot negate ACK|Fakes explicitly test client control flow; do not replace native evidence|
|Loyalty|One SQLite authority; native invoice/credit evidence earned80 then reversed40 once across channel replays. Expiry/holds/redemption/debt/idempotency tested in service suite|Shared deployed transport, full consumer integration/customer linking/admin rule editing/native discounted redemption open|
|Payment|Separate simulated statuses/events, duplicate suppression, failed-payment compensation and native synthetic clearing entries|No approved configured provider sandbox tested. No real transaction or provider refund proof|
|Shipping / returns|Native pick/packing/delivery/partial-return/quarantine and credit document proof|No approved carrier sandbox, labels/tracking/delivery confirmation; no complete buyer return-approval UI|
|Buyer desktop|Actual EN product/cart/invalid form/checkout/confirmation/reload, AR RTL and keyboard search at1363px onf98fa386; demoorderTEST-HR3BHPF5/EUR59; two JPEGs retained|Public isolated demo only. Original catalogue descriptions partly Dutch. No complete accessibility/network acceptance|
|Mobile390/320|**NOT_RUN**|Local Chrome socket IPC denied; documented cloud browser API has no viewport emulation. No policy bypass or metered remote agent used|
|Seller/admin UI|Protected connected workspace, scoped orders/native actions, admin approval/audit timestamps implemented; translated basic EN/AR login/status/actions; SSR regression PASS|Actual rendered connected workspace acceptance blocked by hosted/native reachability. Registration/profile/catalog/content/commission/settlement/report workflows are incomplete implementation, not claimed external blockers|
|Media / brand|Existing BORVAT components, identity and explicit temporary media retained|69 original binaries listed but not recovered. Lovable binary-as-text lossy; authorized asset URL401/editor access wall. Lossless authorized export required|
|Mail|Public isolated HTTP refuses delivery webhook405; original email render tests pass; prior Mailpit9PASS evidence retained|No customer mail sent; no claim of a new SMTP run forf98|
|Legal / tax|Separate official-source gap review retained|No legal/tax/commercial compliance or readiness claim; zero-tax fixtures are not Dutch/Belgian tax acceptance|

Final client validation:27frontend/typecheck PASS,44component/client-recovery PASS, both
connected-test and isolated builds PASS, isolatedHTTP200/email405 PASS. Baseline service/
loyalty17PASS and durable command journal7PASS retained. Edited lint0errors/1existing
mixed-export warning. Source-review486unchanged+13reviewed/69missing assets PASS; this
is a bounded source-evolution check, not full original binary parity. Historical foundation
policy gate still ineligible, as recorded; current isolated work does not imply release approval.

## Minimum external prerequisites to unblock full acceptance

1. A durable, explicitly synthetic hosted order datastore and reachable isolated WMS/native
   Accounting runtime, with test-only credentials provisioned through their own services.
   The present Render filesystem is ephemeral. No production/SAM database or secret may be
   reused. Any additional paid disk/service needs a concrete approved infrastructure/cost decision.
2. The approved PSP/carrier sandbox accounts, bindings and callback endpoints. Do not replace
   real provider validation with simulator success or move production secrets into this test.
3. A lossless authorized export/session for the69 missing original media binaries.
4. An authorized browser environment supporting390px/320px to complete responsive acceptance.

Remaining independent implementation is explicit in the table: commercial company/SKU/pack/
tax/shipping-fee contracts, Marketplace partial shipments, full seller onboarding/offer creation,
buyer return review, administration/catalog/content, sourced commission/settlement reports,
shared deployed points consumers/identity/redemption, and complete EN/AR catalogue/UI content.
These are unfinished features, not tests silently marked passed. Full project acceptance must
remain open even after the external prerequisites are available.

## Reproduction, evidence and rollback

See [native acceptance](NATIVE-ACCEPTANCE.md), [run06 hashes](server-native/run06/MANIFEST.json),
[client/deployment hashes](server-native/client-f98/MANIFEST.json), and
[execution handoff](../EXECUTION-STATE.md). The exact native bootstrap command, sources and
failure history remain in the repository; it creates fresh disposable databases/sites/keys and
verifies shutdown/removal. No original destructive migrations were replayed.

Rollback the existing isolated preview to2d2c221/95603f5/6f6b4ed through its prior deployment;
no database migration is required there. The new backend closes when connected-test/private
configuration is removed. Preserve/export synthetic order/command metadata before deleting a
future durable test deployment. Do not merge Draft PR34 or publish production.

Owned native services stopped and private databases removed after run06. No background
implementation or future unattended testing is claimed after this session ends.
