# Owner-approved test deployment and desktop acceptance

**The test preview works; the full marketplace goal remains incomplete.**

[Open the test shop](https://borvat-marketplace-preview-paid.onrender.com/discover) ·
[Draft PR33](https://github.com/borvat/borvat-global-marketplace/pull/33) ·
[Structured evidence](preview-evidence.json).

## Authorization and deployment actually completed

After the earlier automatic-review rejection, the owner explicitly answered “موافق”
to changing only the existing paid test service's branch and deploying it on its current
plan. The authenticated Render dashboard saved
`implementation/marketplace-cycle-2026-10-24` on
`borvat-marketplace-preview-paid` / `srv-dbdr7rl9fdbs738d1ekg`.
Readback confirmed that branch, the same0.5c-512mb plan and auto-deploy off.
No new service, cost/plan, credential, database, production deployment or main merge was made.

- First deploy `dep-dbe2f6navr4c739rverg`: source9316ce7, observed **live**.
- Browser validation exposed React hydration error418 on a stored-order reload.
- Corrective deploy `dep-dbe2hsjrjlhs738qkkl0`: exact application source
  `6f6b4ed079042cfc314095952073a7e0835a0ff4`, observed **live** at
  `2026-10-24T03:42:38.461012Z` (06:42 Damascus).

A later documentation-only commit may advance the PR head; the code actually run is pinned
above. Previous native/provider/media/release findings are not closed by this deployment.

## Fixes arising from actual browser use

The commercial adapter now supplies an immutable boot snapshot separately from mutable
browser-restored state. Both consumer hooks use that snapshot for server rendering and
hydration, then read current browser state. This follows the [React external-store
hydration contract](https://react.dev/reference/react/useSyncExternalStore).
A unit regression holds the boot reference stable through restore, and a separate real
SSR test does not render a browser's private persisted requests in the boot HTML.
Populated static-workbench examples explicitly supply a populated render fixture; they
remain UI projection tests, not application hydration or identity acceptance.

Cart quantity/remove labels now include variant and seller, so two offers for the same
product have distinct accessible controls. Transaction dates use Europe/Amsterdam for the
NL/BE shop rather than whichever timezone the browsing environment uses. Workbench copy
now accurately distinguishes browser-persisted requests from tab-local offer changes.

Local current checks: TypeScript/commerce **27 PASS**; component/navigation/email static
suite **38 PASS**; isolated build and actual loopback HTTP **PASS**; edited-file lint **0
errors/1 existing fast-refresh warning**. The earlier7 SQLite/124 prototype/9 foundation
results remain scoped predecessor evidence and were not relabelled as new native tests.

## Actual cloud-browser exercise

At CSS viewport1363px, the new shop was opened and visually inspected. No horizontal
overflow was observed. The following was exercised via the real UI, not injected app state:

1. Search for eettafel, open one canonical product, select competing offers from sellerA/B.
2. Add one item from each seller. Cart subtotal/total€1508.00, with seller lines€749/€759.
3. Reload the cart: both lines retained. Submit empty checkout: field errors appear and
   focus moves to the first invalid field.
4. Fill synthetic `.test` contact/address data and submit one local TEST checkout.
   `TEST-6LRLWXWH` appeared, then survived reload; history contained exactly one row.
   The UI explicitly stated that payment was not executed.
5. SellerA view showed only its€749 line; sellerB only its€759 line. Admin showed both
   and€1508 total. Preparing one seller did not complete the other; both produced the
   shared demo-prepared status. That status survived document reload.
6. On the corrective deploy, re-enter the saved confirmation URL, reload it, navigate
   through workbench and recheck seller projections: no application console errors
   were observed after the fix. Browser-extension errors were separately excluded,
   not attributed to the application or erased from the baseline finding.
7. Change sellerA cart quantity to2: line total€1498; remove the line: sellerB remains.
   Confirm separate input IDs/labels including seller identity. Clear the remaining cart.
8. Zero availability disables add-to-cart. Unknown product shows a missing-product state.
   Simulated catalog load failure shows an error; retry recovers. Unknown search shows
   an explanatory empty state.

These prove the **synthetic local UI path**, not actual login/tenant enforcement, native
stock reservation, provider payment, legal invoice, fulfilment or return. A role switch
is not an authenticated seller session. No PSP/carrier/engine call or customer email was
executed from this UI. The previous local Mailpit9-message test remains separate evidence.

Public HTTP checks verified discovery200, operational/account routes404 and write/email
routes405; the initial deployment's referenced JS/CSS assets returned200 with no external
SSR resource URLs. The final deployed index bundle was independently read back as200;
its path/hash are in structured evidence. This is not a complete browser-network trace.

## Visual/device limits and remaining goal

Local Chromium still crashes before opening a page. The working cloud-browser API does
not expose documented device/viewport emulation. A file-based responsive frame harness
was rejected by browser URL policy; that rejection was not bypassed by rehosting, raw CDP,
other browser surfaces or indirect execution. **390px/320px and physical-mobile checks are
NOT_RUN.** A cropped screenshot is not accepted as a mobile viewport test.

Cloud screenshots were captured and visually inspected. The documented shared-file transfer
did not produce a nonempty attachable file after the bounded wait, so no screenshot download
link is claimed. The live preview above is verified and remains available.

Native WMS/Accounting adapters and authoritative company/SKU/document mapping, authenticated
seller/admin backend, payment/carrier sandbox, shared loyalty implementation, partial native
return/credit/refund,69 original media files, EN/AR/RTL, full accessibility/device and
commercial/legal acceptance remain open. No complete-goal, compliance or commercial-readiness
claim is made. No background development task is claimed after the session ends.
