# ADR008 — isolated server orders and native test boundary

2026-10-24 · engineering test decision · no production adoption.

Continue the existing TanStack application and commercial components. Add an explicit
`connected-test` build profile, a server-only SQLite order/quote/session service and
an installable synthetic-only Frappe extension. The `isolated` preview retains its
clearly labelled local demonstration; neither profile silently falls back to the other.
Default and isolated builds still deny API writes. Connected builds refuse operational
requests without an explicit private marked directory, origin and private native binding.

SQLite stores accepted commercial snapshots, identity, audit, payment **simulation**
observations and integration intent/reference metadata. It contains no Bin, stock ledger,
reservation quantity balance, invoice numbering, GL or financial account balance. Native
ERPNext owns Sales Order/SRE/Pick/Packing Slip/Delivery Note/return/Sales Invoice/credit/
Payment Entry/SLE/GL. Shared points have one separate authoritative test journal, never
one independently writable copy per channel; see ADR007 and its implementation note.

## Explicit identity and transaction boundaries

Guest access is an opaque HttpOnly/SameSite cookie, hashed in the server database. Staff
passwords are salted scrypt; current enabled status, role, seller and approval are read
on each command and again after remote I/O. A seller projection excludes other sellers'
lines/references and buyer email. An admin's entire order view is not returned to a seller.
There is no browser role switch in this profile. Staff bootstrap is a local operator API,
not a public role-grant route. Cross-browser guest recovery and buyer login remain open.

Prices, quantities and totals are accepted only from server offers and expiring quotes.
The order and seller portions commit before native dispatch. Durable command lookup
precedes resend and preserves unknown outcomes after transport loss or process death.
Native commands have their own payload-bound durable receipt under current Surooh identity.
Checkout requests reserve each company through native WMS; a definite rejection causes
compensation through native cancellation of other confirmed holds. Across independent
sites this is a saga, not a distributed atomic database transaction. No payment success
is accepted until every seller reservation is confirmed. Run06 verifies durable cancellation intent, native release after failed simulated payment,
manual unpaid expiry and post-commit crash recovery. Pending/unknown payment is excluded
from expiry. Automatic hosted scheduling, late provider capture and broader operational
recovery remain open; uncertain outcomes are never displayed as success.

## Contract0.1 scope and compatibility

This additive receiver is `borvat_native_test.api`, installed **only** on new
`wms-native-a/b.invalid` sites with synthetic guard configuration and distinct databases/
keys. It reuses the pinned Surooh current-role/JWT guard, WMS native operations and command
metadata. Existing WMS endpoints/contracts and native engine source are unchanged.
It is NOT the production Warehouse v1/Accounting v1 contract in mission03, and it is NOT
the separate Accounting invoice-workbench HTTP/UI application. That consumer remains
an explicit integration dependency. SAM contracts remain scoped facts/proposals only.

Bindings for acceptance: seller-a→TEST-A/site-a, seller-b→TEST-B/site-b, native stock SKU
TEST-C1 with one-unit packs at EUR20, a separate BORVAT-LAST fixture with exactly one
unit. Native TEST-CUSTOMER is explicitly bound to a single shared synthetic loyalty
customer in the acceptance harness, never inferred from email. The same native document
number on two sites is qualified by company. Lab prices/tax are zero-tax fixtures, not
NL/BE tax compliance. Arbitrary prices, pack conversions, commercial tax treatment and
shipping charges have no validated native document mapping: invoice commands with a
nonzero shipping charge are blocked rather than issuing a silently incomplete invoice.

Delivery is a native goods/COGS document; no carrier booking, tracking or physical delivery
is inferred. A partial return enters a native quarantine warehouse pending inspection;
a credit does not itself prove a PSP refund. Native Payment Entry receipts/refunds record
synthetic clearing evidence only, explicitly sourced to a simulator and no real provider.

## Hosting and rollback

The existing Render service has no persistent disk/database or cohosted native engines.
Do not place durable orders on its ephemeral filesystem or reuse SAM/WMS cloud databases.
No paid storage/service or secrets migration is authorized by this decision. Keep its
public preview in the isolated profile until persistent test hosting and reachable native
bindings are available. Its last verified rollback is application6f6b4ed on PR33.
Disable the new profile/remove its private test configuration to close the API; preserve
or export only synthetic order metadata if needed. Original migrations are not replayed.
No main merge, production deployment, real payment/mail or legal-readiness approval.
