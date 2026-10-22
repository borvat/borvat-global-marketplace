# BORVAT Global Marketplace — Commercial Application Completion

2026-10-22 (Asia/Damascus). Reviewed latest Draft PR22 head `7306cd9d9479a81b3443d8611e754450b9efd4a8` before work. This is an independent additive functional draft stacked on that branch; it does not alter PR22/main/Lovable or start C1/Codex.

## Delivered in this bounded stage

- Buyer UI: original-fixture catalog, search/category/price sort, compare competing seller offers, cart quantity/removal, explicit article quote and local demo requests/statuses.
- Seller UI: select an example shop, edit price into draft, request review, see and prepare its demo request lines. All participating shops must prepare before whole request becomes prepared.
- Admin UI: overview, offer publish/return-to-draft, shared request overview.
- One typed synthetic-memory adapter; snapshots preserve requested line prices, reset/reload disposes state. No payable checkout, stock reservation, invoice, GL or shipment action.
- Original BORVAT component/style reuse: Card/Button/Input/Label/Badge, formatEur, brand tokens and demo product fixtures. Existing source/route wiring stays preserved. ProductCard/header/root with backend-client dependencies are intentionally not mounted in the standalone local workbench.

This is functional frontend code and a local preview entry inside the existing repository, not documentation alone, a replacement app, a Mercur migration or completion of every original route. Real accounts/backend order/payment/returns/carrier/persistence/integration workflows remain outside this delivered demo.

## Actual verification

| Check | Result | Limit |
|---|---|---|
| Commercial/domain/static React tests | 22 PASS | Includes buyer, seller, admin/cart/order render branches; no browser click proof |
| Original email component render tests | 9 PASS | No sending; paid-order template copy remains unchanged and is never connected to unpaid requests |
| New TS including tests | PASS / exit0 | Strict scoped config; no any casts/rule suppression introduced |
| New TS/TSX lint | PASS / exit0, 0 errors/0 warnings | Five new TS/TSX source/test files |
| Scoped preview build | PASS / exit0 | Local entry only; not original whole app |
| Loopback HTTP smoke | PASS / two HTTP200 responses | HTML/transformed entry only |
| Whole-app build | FAIL / exit1 locally | Original hero.jpg missing; detailed whole-app diagnostics excluded pending specialist disclosure review |
| Original recovered source | 499/499 text hashes PASS | 69 original binaries missing |
| Browser interaction/mobile/visual parity | BLOCKED / NOT_RUN | Browser connection refused; local Chromium absent; offline DOM runtime unavailable; no repeated browser attempt |
| C1 gate / hosted CI | HOLD / billing BLOCKED | No authorization, billing repair or Actions rerun |

Exact argv/exits/log hashes: [commands](evidence/commands.json), [raw tests](evidence/commercial-tests.log), [HTTP](evidence/local-http.json), [browser limitation](evidence/browser-status.json). A development-only generic email test typing failure is retained in development-types-failure.log; corrected with concrete typed cases and final full scoped typecheck PASS, not suppressed. Installed versions and original reused-input hashes are retained. Current app dependencies were reused; authoritative lockfile/fresh app install remains OPEN. Original 35 full acceptance scenarios remain NOT_RUN.

## Original assets and interfaces

Authorized source check recovered **0/69**. Lovable original head remains `42fcde8cf1b2a11422c32301b6b423d3b5d39942`; no repeated old 402/404 asset fetch. Accessible Mission03 zip contains 15 documents and no media. No matching editable Replit source was resolved; current main has no media blobs. This does not establish absence of other owner backups. [New source-check receipt](evidence/asset-source-check.json), [existing per-file impact/provenance](../c0-app-readiness/ASSETS.md). Need authorized original binary export/proven backup; no generated replacement or invented URL. UI states that original images are unavailable.

Accounting/WMS ownership and functional contract retained in [integration boundary](INTEGRATION.md). No second quantity/reservation/valuation/financial ledger or endpoint call. Real business integrations remain untested.

## Gate and review outcome

**C0 HOLD; C1/Codex NOT_AUTHORIZED.** [C0 plan](C0-PLAN.md), [self-review/limits](REVIEW.md), [functional acceptance](ACCEPTANCE.md), [local run instructions](../../experiments/commercial-application/README.md), [hash manifest](manifest.json). Specialist blockers and human review remain open; no sensitive test, rejected-text retry or specialist closure claim. Human code/UX review and browser E2E are pending. This record is not human approval.

A whole-app lint artifact upload was rejected by automatic review because it contains sensitive source references outside this functional scope. It was not retried. All whole-app diagnostic files and their source-path inventory are excluded from this draft delivery and retained locally pending specialist review; no approved durable private vault or human handoff is claimed. Only scoped functional logs accompany this change.

All accepted baseline blobs are preserved. No merge, deployment, production record/database/account/payment, paid service, subscription change or outgoing correspondence. Rollback: abandon the new draft branch/additive files; there is no data migration to reverse.
