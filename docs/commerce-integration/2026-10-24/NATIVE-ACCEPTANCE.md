# Native integration checkpoint — full marketplace remains OPEN

## Frozen native baseline actually executed

Source `31e2db7c692dc0313c1cca7cebee17bbb6e2f923`, branch
`implementation/server-orders-2026-10-24`, Draft PR34 stacked on PR33.
Fresh local ERPNext/Frappe16.52.0, MariaDB11.8.9, two synthetic sites/databases/keys.
WMS `582469d37d4ff3f920e009bdd9cfe9ce5a5fe2f0`, exact native Accounting subset
`a2ba7f813561147ef6ea61c4cf3dc93e70ce0714` (not the separate invoice workbench).
No seed restore or existing cloud database was used. Services stopped and private data
removed after the run; the bootstrap verifies cleanup. See [run06 manifest](server-native/run06/MANIFEST.json).

Observed: BORVAT native HTTP cycle **11 PASS**; compiled original TanStack/Nitro HTTP/SSR
**3 PASS**; unchanged upstream WMS native regression **55 PASS**, rendered browser case
**1 BLOCKED**. The overall upstream bootstrap exits2 / PARTIAL_NATIVE_EXECUTED: do not
relabel it as complete browser acceptance.

The compiled application itself created a secure guest session, accepted a server quote,
saved one order and native reservation, denied another guest and sellerB, then retained
that order/cookie/reference after the actual server process restarted. Its Arabic SSR and
operational-route guards passed. This is HTTP/SSR evidence, not rendered browser evidence.

Buyer multi-seller test order: `BVT-TEST-d8ff7a92-fb10-4514-a538-22b191f850b3`. TotalEUR80, two seller invoicesEUR40 each;
each has a native receiptEUR40, partial creditEUR20 and native refund entryEUR20.
Payment initiation/confirmation is explicitly SIMULATED; these native test Payment Entries
are bookkeeping fixtures and do not prove provider settlement or any money transfer.

|Company/site scope|Native order|Reservation|Delivery note|Invoice|Partial return|Credit|Receipt / refund entries|
|---|---|---|---|---|---|---|---|
|TEST-A|SAL-ORD-2026-00034|MAT-SRE-2026-00174|MAT-DN-2026-00030|ACC-SINV-2026-00001|MAT-DN-2026-00031|ACC-SINV-2026-00002|ACC-PAY-2026-00001 / ACC-PAY-2026-00002|
|TEST-B|SAL-ORD-2026-00001|MAT-SRE-2026-00001|MAT-DN-2026-00001|ACC-SINV-2026-00001|MAT-DN-2026-00002|ACC-SINV-2026-00002|ACC-PAY-2026-00001 / ACC-PAY-2026-00002|

Identical invoice numbers on different isolated sites are separate company-qualified
identities, not duplicate documents. The native reads verified one invoice/credit and
two Payment Entries per seller, zero outstanding, balanced GL, net stock movement-1 per
seller after shipping2/returning1, and native return stock in quarantine pending inspection.
The shared journal earned80 points from the two native paid/fulfilled invoices, then
retained40 after their partial credits. Marketplace/invoice channel replays did not earn
twice. This does not prove native discounted redemption, a deployed shared service or
complete cross-application customer identity.

Two distinct buyer orders contended for exactly one native BORVAT-LAST unit: one native
reservation completed, one was definitely rejected. A real child SIGKILL immediately
after remote native commit, then a31-second real lease wait and service reopen, recovered
one reservation with dispatches=1. No second native reservation was created. Source hashes,
IDs, actual SLE/GL rows and case detail are in the JSON; do not substitute fixture fakes.

## Verified cancellation, expiry and client continuation

Run06 also proves failed simulated payment releases an actual native hold once, leaves no
invoice/Payment Entry/points, and restores available stock. Order
`BVT-TEST-fc833046-12aa-4257-92ec-f3dfe7a55c19` / native `SAL-ORD-2026-00035`.
The explicit channel-clock expiry sweep released native order `SAL-ORD-2026-00036` for
`BVT-TEST-d5db0191-0537-476d-a50b-2fe2f8223fd1`. The clock advances15minutes only in the
harness; this is actual native cancellation but not a hosted scheduler. Pending/unknown
payment is retained for reconciliation instead of releasing stock on an assumed failure.

The last-unit contention produced one native `MAT-SRE-2026-00178` and one validation
rejection. The real post-commit SIGKILL recovery produced exactly one native reservation
`MAT-SRE-2026-00179`, dispatch count1 after a31-second actual wait. The compiled application
created `BVT-TEST-8754118e-e990-4f20-a3c9-acbf96c31ddf` / `SAL-ORD-2026-00039` /
`MAT-SRE-2026-00180` and recovered it after process restart.

Later client-only source `f98fa386529694ca721211bce389f050e642adfc` preserves unresolved
checkout identity across reload/address edits, refreshes expired quotes for another explicit
buyer confirmation, rejects malformed200 responses and survives local cleanup failure after
ACK. Four fake-transport regression cases prove that client behavior; they are not native
engine evidence. Backend/native source hashes remain identical to run06. The same continuation
localizes basic connected workspace/login/order states, date/money, buyer navigation and
error labels, preserves RTL on the workspace and displays audit timestamps. Native reference
IDs remain unchanged. Arbitrary catalogue descriptions and legacy demo workspace still need
content translation. The final source has27 frontend/typecheck and44 component/recovery cases
PASS;17 SQLite service/loyalty and7 durable command cases were accepted at the native baseline.

## Actual public desktop observations

Render existing test service `srv-dbdr7rl9fdbs738d1ekg`, same0.5c-512mb plan, auto-deploy
OFF, isolated profile. Deploy `dep-dbe3u6favr4c73a0l8o0` is LIVE at sourcef98fa386
(finished2026-10-24T05:17:14.396620Z).
The public preview is still a labelled browser demonstration, with the new connected
backend deliberately disabled: the service has no durable order DB/disk or native engine.
Desktop1363px Arabic/English navigation and hero/category translations were inspected.
After hydration the root has lang=ar-NL/dir=rtl and no horizontal overflow. First deployment
95603f5 exposed untranslated hero/categories and a document-language effect disabled by
host metadata management;2d2c221 fixes these, backed by an actual SSR regression.
Languages remain incomplete in catalog descriptions, legacy demo workbench and some text.

At f98fa386 the actual desktop browser completed product→basket→empty-submit validation
(focus returned to first invalid field)→synthetic form→keyboard Enter submit→order
`TEST-HR3BHPF5`, totalEUR59. Reload retained this explicitly browser-only demonstration.
Arabic switching retained the order and set rootlang=ar-NL/dir=rtl, viewport1363px, no
horizontal overflow. ArrowDown/Enter on the Arabic search combobox opened the suggested
product; navigation, stock badges and shipping labels were inspected. These are public
ISOLATED UI observations, not the connected native cycle above.

[Arabic confirmation](server-native/client-f98/desktop-ar-confirmation.jpg) and
[Arabic product](server-native/client-f98/desktop-ar-product.jpg) are actual viewport captures
from that deployment, stored as the same inspected bytes and hashed in
[client-f98 manifest](server-native/client-f98/MANIFEST.json). Basic English field/error
translations now render correctly. Original product descriptions/spec values remain Dutch.
Browser logs contained extension metadata errors; full request-level network capture was
not available, so no complete network-clean claim is made. A test invocation from the
wrong working directory failed alias resolution; corrected application test context ran44/44.

Local browser execution is blocked: the full official Chrome binary aborts on
process_singleton_posix socket() EPERM (IPC is denied). The cloud API advertises no viewport
emulation.390px/320px, rendered connected buyer/seller/admin, complete keyboard/accessibility
and responsive screenshots are NOT_RUN. The source has responsive CSS; that is not device
acceptance. No attempt was made to bypass IPC, browser URL policy or authentication.

## Real external dependencies and remaining implementation

- Persistent hosted test order storage and reachable isolated native engines are absent.
  Never put durable orders on Render ephemeral storage or reuse production/SAM databases.
- No approved/configured PSP or carrier sandbox was found/activated; no real provider,
  carrier tracking, label purchase, external mail, production invoice or real stock write.
- Receiver0.1 is explicitly test-only (EUR20/one-unit SKU/zero tax). Commercial price/pack/
  tax mappings, shipping-charge invoicing, partial shipment orchestration in Marketplace,
  commissions/settlements and full reconciliation reports are not complete. Shipping
  charge invoices are blocked rather than silently omitting amounts. WMS's own batch tests
  do not certify the Marketplace batch interface.
- Shared loyalty transport, both complete consumer applications, managed rule editing,
  buyer identity recovery/linking and native discounted redemption remain open.
- Seller/company registration beyond preconfigured test companies and complete admin
  catalog/content/permissions workflows remain open; no public role-grant endpoint exists.
- Lovable authorized inventory still lists69 binaries at42fcde8. Its read_file interface
  returns binary as lossy Unicode text; public preview asset request returns401 and the
  editor shows a login/access wall. No original bytes were restored or fabricated. The
  existing owner delivery ZIP contains patches/screenshots, not those product assets.
- Official-source legal gap review remains [separate](../LEGAL-RECHECK-2026-10-24.md). These
  zero-tax native tests are not legal, tax, accountant or commercial-readiness approval.

## Failure history / rollback

Predecessor01 used a reused SKU as a last-unit fixture (2 successes) and was correctly
failed; a newly created one-unit BORVAT-LAST fixture corrects the test. Predecessor02
recovered before its durable lease elapsed and was correctly failed; the run now waits
31 real seconds. Predecessor03's native cases passed but private-directory cleanup raced
filesystem teardown (Errno39); its owned residual directory was independently removed.
The composed wrapper now bounds retries only for its own disposable root; later runs
verify service shutdown and removal. Earlier blocked browser results remain blocked.
One temporary execution-host disconnection prevented starting a follow-up run; it was
not claimed as executed, and the recovered environment was inspected before retrying.

Rollback: retain6f6b4ed or95603f5 as previous public preview commits; do not merge PR34.
For the new service, disable the connected-test profile/private configuration. No original
migration or deployed production data was modified. No continued background development
is implied when this session ends.

## Final incremental checkpoint — b771e309

Application source `b771e309191b9616007b6d83969202ff77629feb` adds only buyer catalogue
error-state/search/accessibility copy and its regression test after the f98 baseline.
Observed local results before execution-host loss: TypeScript/frontend27 PASS;
component/client-recovery45 PASS; isolated build and HTTP200/email405 PASS; edited lint
0 errors. The catalogue failure injector on the actual f98 desktop had recovered via Retry
but incorrectly continued announcing loading; b771 corrects that. Its rendered post-deploy
retest is **NOT_RUN** because the execution environment and browser became unavailable.
The two retained desktop screenshots are explicitly f98, not b771. Native/backend files
remain unchanged from the31e2db7/run06 proof.

Additional local CI equivalents observed at f98: foundation9PASS, core-money10PASS,
prototype124PASS. Original-parity completeness remains FAIL:69missing binaries plus
13bounded source evolutions, separately reviewed. These are not a green hosted CI result.
GitHub run [40066144087](https://github.com/borvat/borvat-global-marketplace/actions/runs/40066144087)
on b771 concluded failure with all four jobs NOT_STARTED due to an external account/runner
restriction, verified in the authenticated run UI. No steps or downloadable job logs exist.
No account/payment settings were changed, retries purchased or completeness gate weakened.

The final host disconnection happened before raw b771 logs and this supplemental local
CI output could be archived. Counts above are session observations, not invented log files.
Earlier run04/run05/run06/client-f98 artifacts and exact raw hashes are committed and
verified (13/4/4/12files respectively, zero hash mismatches). Code and tests are recoverable
from this branch; no uncommitted implementation is required to reproduce them.

Render attempt `dep-dbe427ss728c7393fhl0` targets b771 on the SAME isolated service/plan,
auto-deploy OFF. Deployment status is recorded separately after querying Render; never
infer native backend hosting from a successful frontend deploy. Full project remains OPEN.

Final Render query: **LIVE**, source `b771e309191b9616007b6d83969202ff77629feb`, deploy
`dep-dbe427ss728c7393fhl0`, finished `2026-10-24T05:25:55.049944Z`. Rendered retest remains NOT_RUN.
