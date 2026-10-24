# BORVAT execution checkpoint — 2026-10-24

**Requested end-to-end goal is NOT COMPLETE.** No native Marketplace→WMS→Accounting
sale/partial-return/loyalty cycle was executed. Do not merge or describe this as a
commercially ready marketplace. No background work continues after this session.

Branch: `implementation/marketplace-cycle-2026-10-24`.
Draft: https://github.com/borvat/borvat-global-marketplace/pull/33 (stacked on PR32).
Starting source: `1a1d017beb5004d046972e87089e3a2bc3a7671e`, PR32,
not main or the historical PR22. The GitHub PR collection and all fetched remote
branches were inspected; PR32→31→30→29 is the latest Marketplace continuation.

## Changes that actually exist

- Full persisted-order schema validation: malformed dates, null/invalid lines, quantities,
  seller preparation, payment/checkout fields, totals and duplicate identities are rejected.
  A bad row does not discard valid sibling rows. Unknown storage versions are ignored.
- Storage commits precede UI confirmation/cart clearing. Quota/privacy/read failures are
  visible; unavailable storage cannot confirm checkout; unchanged-key retry can save once.
  Changed checkout data under a reused key conflicts. ID collision attempts are bounded.
  Checkout size limits match the persisted schema so accepted oversized fields cannot
  silently disappear on restore.
- BORVAT replaces inherited “marktje” metadata/footer naming. Existing components and
  design remain; imported source evolution is tracked separately from recovery hashes.
- Real SQLite command-intent journal with scope callbacks, canonical body conflicts,
  durable leases/bounded attempts and lookup-before-dispatch recovery. It stores no stock,
  reservation, invoice, financial balance or points. It has no configured native receiver,
  HTTP endpoint or UI binding. This is an integration building block, not a completed adapter.
- Fixed archived synthetic shipping provider's malformed UUID regex. Corrected three
  invalid tests (missing tenant in positive grant fixture, all-numeric case-folding UUID,
  overescaped regex syntax); authorization and duplicate-key rejection are not relaxed.
- Updated stale SKU/pack fixture assertions, HTTP markers and browser scenarios for the
  current guest checkout/storage behavior. Browser scenarios are prepared, not passed.
- Proposed one shared points authority in ADR007. No local checkout awards points and no
  financial/inventory ledger was added. Shared loyalty implementation remains missing.

## Independent verification

| Check | Observed result | Scope / limits |
|---|---|---|
| TypeScript + current commerce tests | 26 PASS / 0 FAIL | Actual frontend/domain tests, synthetic catalog and browser-storage doubles |
| Commercial component/navigation/email render suite | 37 PASS / 0 FAIL | Actual original React components; static rendering, not browser interaction |
| Archived prototype suite | 124 PASS / 0 FAIL | Isolated prototypes/fakes, not production/native commerce |
| Command journal | 7 PASS / 0 FAIL | Actual SQLite files, two actual connections, actual child SIGKILL; remote receiver explicitly simulated |
| Foundation unit suite | 9 PASS / 0 FAIL | Policy/reference mechanics, not release acceptance |
| Default and isolated original-app builds | PASS | Locked dependencies; build environment drops provider credentials |
| HTTP boot/isolation | PASS | Actual HTTP SSR; default discovery404/email503; isolated discovery200/email405 and browser harness route/method checks |
| Local Mailpit1.32.0 SMTP + API readback | 9 messages PASS | Actual local SMTP receipt, HTML/text readback; only `buyer@example.test`, no external delivery/production mail adapter |
| Application lint on edited files | See EVIDENCE.json | Final command/exit recorded separately; no full legacy lint claim |
| Imported source evolution check | PASS | 486 unchanged +13 reviewed original text files;69 original binaries still absent |
| Browser replay | BLOCKED, exit2 | HTTP stage passed; Chrome156 process SIGSEGV before opening a page. No new desktop/mobile screenshots or visual acceptance |
| Complete owner acceptance cycle | NOT_RUN | Native adapters, authenticated test backend, financial/operator mapping and loyalty service are absent |

Failed preliminary commands/runs remain in the evidence summary. Counts are separate
suites and overlap in functionality; do not sum them into native/full-journey certification.

## Integration and requested workflow status

| Area | Current state | Required before acceptance |
|---|---|---|
| Buyer | Search/category/SKU/offer/cart/guest TEST checkout and local history exist; current schema/storage fixes tested | Authenticated durable server orders, quotes, failure recovery, real reservation/payment evidence |
| Seller/admin | Existing labelled shared demo workbench; synthetic per-seller projection tests pass | Actual company onboarding/independent approval, least-privilege sessions, own-data API enforcement, admin/audit/report acceptance |
| Multi-seller | UI/local request can contain two sellers | Correct native parent/suborder/fulfilment and seller invoices; one approved provider charge/allocation model; no native settlement proof |
| WMS | Remains only stock/reservation/movement authority; no Marketplace stock writer added | Reviewed versioned company/SKU/BOM mapping and actual endpoint binding; last-unit race, expiry/cancel, pick/ship/partial return through native engine |
| Accounting | Remains only invoice/credit/GL/balance authority | Operator/seller invoice timing/tax mapping, native document requests/status reconciliation, partial credit/fee/refund acceptance |
| Payment | Browser option is a simulation; no sandbox provider API was called | Provider/operator selection, sandbox auth/capture/failure/late/duplicate/refund evidence and durable reconciliation |
| Carrier | UI test shipping rules; archived tariff tests repaired | Sandbox/manual shipment contract, partial shipment costs/labels/tracking and delivery provenance |
| Returns | No complete connected partial/full return | WMS physical disposition + native credit + separate refund confirmation, race/retry acceptance |
| Loyalty | ADR007 proposed; no shared service or executable linked points program | Implement one authoritative journal, customer/program identity, earn/redeem/expiry/credit policy and integration in both apps |
| Languages | Test shop Dutch NL/BE; original app has broader source | Complete EN/AR dictionaries/RTL and actual device/browser QA remain missing |
| Media | Attached `borvat-delivery.zip` inspected | ZIP contains patch/reports/22 screenshots, not original product/logo binaries;69 remain unresolved. Placeholders are explicitly labelled, not recovered originals |
| Legal/tax | Official-source gap recheck saved | Operating-model scope and qualified accountant/legal review; fixed21% fixture is not tax compliance |

## Upstream state refreshed without claiming its results as ours

- WMS PR28 `d4a14a02afce653f30b98732279bf73a22da9ad7` is the partial-shipping
  candidate, with earlier PR21/22 reports superseded by later engineering candidates.
- Accounting PR36 `39b7674d7ceb6458e039d99f5e30f7ba4e7588a3` is its paired
  partial-shipping candidate. Native lab API was read. It is explicitly synthetic-only,
  resolves TEST-A/lab-manual identity, and is not a deployed Marketplace business contract.
- Accounting PR37 `a2ba7f813561147ef6ea61c4cf3dc93e70ce0714` is a later unexecuted
  remainder-close candidate; do not promote it merely because it is later.
- Accounting invoice workbench PR32 `4038ddd575ae7f16e3312fdaded99374b0f320dd`
  is a separate branch; its native evidence is not Marketplace invoice integration.
- Direct authenticated Accounting git clone was unavailable in this workspace; authorized
  GitHub reads remained available. No secret was requested/copied to bypass this.

No native upstream suite was run in this session. A native lab implementation in another
branch is not a live API. Generic command metadata is not a substitute for schema/identity
binding, actual native documents or provider contracts.

## Exact external blocker and preserved state

Read-only Render discovery found the existing paid test service
`borvat-marketplace-preview-paid` / `srv-dbdr7rl9fdbs738d1ekg`, Frankfurt,
branch `implementation/canonical-catalog-2026-10-23`, deployed commit
`5e91ecce2b6e6cc65924a2739459a491b220b260`, auto-deploy off. Its preview remains
https://borvat-marketplace-preview-paid.onrender.com and is **older source**, not PR33.
The isolated build scripts strip provider credentials and do not run migrations; isolated
HTTP dispatch denies operational/write routes. There is no Marketplace database in the
observed Render inventory. No existing WMS or SAM database was repurposed.

The Render plugin has no service-branch update operation, so the authenticated dashboard
was inspected. Automatic approval review rejected saving a branch change, stating that
modifying this shared service's configuration lacked explicit authorization. No saved
branch/configuration change, deploy, new service/cost, main merge or production mutation
was performed. Rejection was not bypassed through API, shell, another service or ref rewrite.

The smallest requested owner approval is specifically: change **only this test service's**
tracked branch to `implementation/marketplace-cycle-2026-10-24` and deploy that branch
within its existing compute plan. This permits reviewing the new UI in the working cloud
browser; it does NOT itself supply native engines, provider contracts, true mobile testing
or commercial acceptance. Other backend/loyalty implementation work remains open.

## Reproduction

Use Node24; install the existing frontend lock with Bun1.3.13 `--frozen-lockfile --ignore-scripts`.
In a disposable checkout, root test files can resolve frontend React/tsx dependencies via
`ln -s apps/marketplace/node_modules node_modules` if root node_modules does not exist.
Do not overwrite an existing dependency directory or use production `.env` files.

- `npm --prefix apps/marketplace run test:commerce`
- `node --test tests/integration-contracts/*.test.mjs`
- `npm run test:foundation`; `npm run test:prototype`
- `TSX_TSCONFIG_PATH=experiments/commercial-application/tsconfig.json node --import ./scripts/foundation/no-external-network.mjs --import tsx --test experiments/commercial-application/tests/*.test.tsx`
- `npm run commerce:build:default`; `node scripts/commerce-integration/http.mjs default`
- `npm run commerce:build:isolated`; `node scripts/commerce-integration/http.mjs isolated`
- Run the updated browser harness only with a working Chromium/Playwright, explicit
  `CHROMIUM_PATH`, `PLAYWRIGHT_MODULE` and fresh `BROWSER_EVIDENCE_DIR`. A BLOCKED result
  is nonzero and does not count as visual QA.
- For mailbox replay start a fresh local Mailpit with only loopback SMTP11025/HTTP18025,
  disable update checks/RDNS/remote CSS, no relay/forward/webhook env, recipient allowlist
  `^buyer@example[.]test$`, then run `email-mailbox.tsx` with the same TSX config and
  network guard. Stop Mailpit and remove its disposable database after the test.

Rollback: review/revert PR33 on its independent branch. Main, historical branches, original
recovery manifest and production services remain unchanged. All local test services were
stopped; no continuing worker/task is claimed.
