# Native integration checkpoint — full marketplace remains OPEN

## Frozen native baseline actually executed

Source `2d2c221a2df56db40bc349e5dbb11d1fcf5f4896`, branch
`implementation/server-orders-2026-10-24`, Draft PR34 stacked on PR33.
Fresh local ERPNext/Frappe16.52.0, MariaDB11.8.9, two synthetic sites/databases/keys.
WMS `582469d37d4ff3f920e009bdd9cfe9ce5a5fe2f0`, exact native Accounting subset
`a2ba7f813561147ef6ea61c4cf3dc93e70ce0714` (not the separate invoice workbench).
No seed restore or existing cloud database was used. Services stopped and private data
removed after the run; the bootstrap verifies cleanup. See [run05 manifest](server-native/run05/MANIFEST.json).

Observed: BORVAT native HTTP cycle **9 PASS**; compiled original TanStack/Nitro HTTP/SSR
**3 PASS**; unchanged upstream WMS native regression **55 PASS**, rendered browser case
**1 BLOCKED**. The overall upstream bootstrap exits2 / PARTIAL_NATIVE_EXECUTED: do not
relabel it as complete browser acceptance.

The compiled application itself created a secure guest session, accepted a server quote,
saved one order and native reservation, denied another guest and sellerB, then retained
that order/cookie/reference after the actual server process restarted. Its Arabic SSR and
operational-route guards passed. This is HTTP/SSR evidence, not rendered browser evidence.

Buyer multi-seller test order: `BVT-TEST-7ebf91b9-4467-4dfa-93df-bf1ba7a00490`. TotalEUR80, two seller invoicesEUR40 each;
each has a native receiptEUR40, partial creditEUR20 and native refund entryEUR20.
Payment initiation/confirmation is explicitly SIMULATED; these native test Payment Entries
are bookkeeping fixtures and do not prove provider settlement or any money transfer.

|Company/site scope|Native order|Reservation|Delivery note|Invoice|Partial return|Credit|Receipt / refund entries|
|---|---|---|---|---|---|---|---|
|TEST-A|SAL-ORD-2026-00034|MAT-SRE-2026-00172|MAT-DN-2026-00030|ACC-SINV-2026-00001|MAT-DN-2026-00031|ACC-SINV-2026-00002|ACC-PAY-2026-00001 / ACC-PAY-2026-00002|
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

## New candidate awaiting native replay

The working continuation adds a durable cancellation intent, native release after failed
simulated payment, an administrator expiry sweep for unpaid holds and stricter server
address validation. Its SQLite tests and builds are separate from the frozen native
baseline above. A native replay must close those cases before claiming them accepted.
The expiry sweep is a manual isolated operation, not a hosted scheduler. Pending/unknown
payment is retained for reconciliation instead of releasing stock on an assumed failure.

## Actual public desktop observations

Render existing test service `srv-dbdr7rl9fdbs738d1ekg`, same0.5c-512mb plan, auto-deploy
OFF, isolated profile. Deploy `dep-dbe3fafb9u1s73c20u90` is LIVE at source2d2c221.
The public preview is still a labelled browser demonstration, with the new connected
backend deliberately disabled: the service has no durable order DB/disk or native engine.
Desktop1363px Arabic/English navigation and hero/category translations were inspected.
After hydration the root has lang=ar-NL/dir=rtl and no horizontal overflow. First deployment
95603f5 exposed untranslated hero/categories and a document-language effect disabled by
host metadata management;2d2c221 fixes these, backed by an actual SSR regression.
Languages remain incomplete in catalog descriptions, legacy demo workbench and some text.

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
