# ADR-007 — shared loyalty authority (isolated design)

Date: 2026-10-24. Status: proposed test design; no deployed implementation or legal approval.

The new owner mandate explicitly includes shared loyalty. Prior documents defer loyalty;
no implemented shared authority or complete prior rules were found in the Marketplace
branches or the inspected Accounting workbench tree. A page showing demo points must
not become a second writable points source.

## Authority and identity

Use one separately owned Surooh loyalty service/journal for both invoice and Marketplace
channels. Neither browser nor either channel writes balances. Namespace the program by
operator/program ID and map the same verified customer ID explicitly; email matching is
not identity. Each participating company requires a current program binding. Financial
liability, discounts, tax bases and credits remain exclusively in Accounting. Points are
not a vendor wallet, cash settlement, inventory, legal invoice or Accounting ledger.

Until the service and least-privilege interfaces exist, display “not connected”; do not
award local points from browser TEST confirmations. Do not deploy two journal copies,
one per application. SQLite command-journal work in this PR stores integration intent,
not this points journal and not an implemented loyalty program.

## Required commands

All commands carry current principal/program/customer scope, rule version, immutable
canonical business reference, command ID, body hash and expected account version.
A unique `(program, company, native-invoice, native-line, eligibility-version)` identifies
an earn source across BOTH channels, irrespective of channel webhook ID.

- `recordEligibility`: references submitted native invoice lines, confirmed payment and
  fulfilment evidence. No earn on a draft, browser checkout or pending payment. Exact
  earning timing and product exclusions must be frozen in a versioned test rule.
- `holdRedemption`: atomic available-points check and expiring hold bound to server quote,
  customer, company, currency and maximum eligible discount. The journal alone owns the hold.
- `commitRedemption`: once against Accounting-confirmed commercial discount and order;
  same source/key returns original movement; changed contents conflict.
- `releaseRedemption`: idempotent cancellation/payment-failure/quote-expiry compensation.
- `applyCredit`: cumulative native credit-note line allocation against original eligible
  lines. Recompute retained earned points cumulatively to avoid per-credit rounding gain.
  Never award again because Marketplace and invoices deliver the same event.
- `expire`: immutable expiry movements against unspent unexpired earn lots, with stable
  `(lot, expiry)` identity. A scheduler retry cannot expire twice.
- `setRules`: independently authorized program administrator; append versions/audit;
  no retroactive silent mutation of prior earn/redeem snapshots.

## Decisions to freeze before executable acceptance

Proposed synthetic rule: integer points; earn per eligible net EUR amount; shipping,
non-eligible goods and redeemed discounts excluded; no cash withdrawal; fixed lot expiry;
no negative redeemable balance. Reverse unspent points first on return. If previously
spent earned points are reversed, record explicit non-redeemable debt or manual exception
according to a single reviewed policy; never clamp the accounting history to zero.
Return of redeemed points must define expired lots, partial returns and discount allocation.
These policies are NOT established merely by choosing a journal or passing UI tests.

## Required acceptance / currently NOT_RUN

Two channels replay one canonical invoice; simultaneous last-point redemption; crash after
commit before ACK; changed-payload conflict; expiry vs redemption vs return races; multiple
partial credits vs single full credit including rounding; payment failure/late success;
returned redeemed goods after expiry; account/company/program isolation; reports reconcile
all points to source movements and every financial discount to native Accounting evidence.
A named authoritative service, versioned policies, authenticated integrations in BOTH
repositories, actual persistent transactions and native invoice/credit acceptance are needed.

## Isolated implementation follow-up — 2026-10-24

`packages/loyalty-authority/journal.mjs` now implements one SQLite authority for the
explicit `test-eur-v1` rule:1 point per eligible net EUR,365-day lots,10-minute redemption
holds, cumulative credit rounding and explicit debt for spent earnings reversed by a
credit. Future earnings offset debt once. Expired unspent points are not reversed again.
Canonical company/invoice/line/rule identities deduplicate across channel labels.
Native evidence verification and current program/customer authorization are required
callbacks; their presence alone does not establish a deployed trusted integration.

Tests use real transactions/connections/reopen, with fake document verification explicitly
labelled. The composed native acceptance separately reads submitted native invoice/credit
and payment evidence for earn/reversal, using one explicit synthetic customer binding.
No browser checkout awards points. This is not yet a deployed shared service consumed by
the two complete applications: buyer identity linking, transport authentication, managed
rule administration, native discounted redemption and returned-redemption policy remain
open. `commit` refuses redemption without Accounting-confirmed discount evidence; the
native harness does not fabricate that evidence to certify redemption integration.
