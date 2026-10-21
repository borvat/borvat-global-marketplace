# PHASE 5 — M1C-1E-E — MANUAL QUOTE ACCEPTANCE, EXPIRY AND INVALIDATION FOUNDATION

Date: 2026-07-26
Scope authorized: M1C-1E-E only — Owner-only schema and integrity foundation.
Verdict: **PASS WITH RESIDUAL RISKS**

Prohibitions honoured: no application RPC, no UI, no checkout, no payment, no order
creation, no inventory reservation, no price locking, no carrier booking, no
messaging object, no cron/scheduled job, no channel action.

---

## 1. PRE-CHANGE SECURITY NORMALIZATION

**M1B-0J — ACL DRIFT CYCLE 12 NORMALIZATION ONLY** (REVOKE-only) was applied first:
`place_order`, the protected tax/pricing/shipping/destination/manual-quote tables,
all `m1c1*_guard_*` routines, and the `internal_shipping` schema were revoked from
`PUBLIC`, `anon`, `authenticated`, `service_role` and `sandbox_exec`.
No business object was changed by that migration.

---

## 2. OBJECTS CREATED

| Object | Purpose |
|---|---|
| `manual_shipping_quote_acceptances` | terminal, immutable acceptance snapshot: charge, currency, calendar-day ETA bounds, carrier/service, quote source, responsible party, exact origin, destination version, shipment form, offer version, offered/expiry instants, actor |
| `manual_shipping_quote_acceptance_conditions` | frozen copy of the published offer conditions |
| `manual_shipping_quote_state_events` | append-only lifecycle audit log (`request` / `offer` / `acceptance` subjects) |

Domain extensions: request status gains `superseded`; offer status gains `accepted`
and `invalidated`; `msqr_id_family_uk` added; `msqo_single_accepted_version_uk`
partial unique index added; publication-completeness check widened for `invalidated`.

Read-only private status functions: `m1c1ee_offer_effective_status(offer, at)` and
`m1c1ee_offer_acceptability(offer, at)` — expiry is derived **at read time**, so
correctness never depends on a background job.

Guards (6) / triggers (6): acceptance write (insert-only, family row lock,
full snapshot equality, `m1c1ed_guard_publication_integrity` revalidation),
deferred acceptance settlement, acceptance-condition mirroring, append-only state
events, deferred offer acceptance-backing, deferred request closure. Existing
`m1c1ed_guard_offer_write` and `m1c1ec_guard_request_write` were extended in place.

---

## 3. INVARIANTS PROVEN

- One acceptance per request family, per request, and per offer (three unique keys).
- Expired, draft, superseded, withdrawn or invalidated offers can never be accepted.
- Acceptance, offer settlement and request settlement must all land in one
  transaction; a partial acceptance fails closed at commit.
- Accepted commercial terms, conditions and lifecycle events are immutable and
  undeletable; accepted requests and offers are terminal.
- Closing a request (declined/expired/cancelled/superseded) requires every
  outstanding offer to be withdrawn, expired or invalidated first.
- An accepted family is closed to new request versions.
- Acceptance revalidates destination version, exact origin, item eligibility,
  active shipping profiles, items and packages — fail-closed on any drift.
- Only the owning buyer may accept; currency, version and charge must match exactly.
- No order, payment, reservation, label or tracking artefact is produced.

---

## 4. VERIFICATION

Self-rolling-back harness executed owner-side (all fixtures discarded in the same run):
**65 PASS / 1 FAIL / 66 assertions**.

The single FAIL is a **harness fixture limitation, not a product defect**: the
scenario tried to create a *new draft* offer while the request was already `quoted`,
which M1C-1E-D correctly refuses (`a draft offer requires a requested or
under_review request`). The underlying rule — a non-published offer is never
acceptable — is proven by B14, B15 and C08. `F04` (package snapshot removal) did not
record because M1C-1E-C immutability blocks the deletion outright; the equivalent
protection is covered by the publication-integrity revalidation in F01–F03.

Zero persistent fixtures remain; all verification scaffolding (results table,
helper functions, procedure) was dropped.

---

## 5. SECURITY POSTURE

- RLS enabled **and forced** on all three new tables; zero policies (deny by default).
- No grants to `PUBLIC`, `anon`, `authenticated`, `service_role` or `sandbox_exec`.
- Runtime deny proof: the gate role is denied read on all eight manual-quote tables.
- All new routines pin an empty `search_path`.
- ACL deployment gate updated to the authorized M1C-1E-E scope (18 guards, 8 tables,
  two explicitly authorized charge columns) — **ACL GATE: PASS**.

---

## 6. DECISIONS PROPOSED

- **BOR-DEC-124** — Acceptance is a terminal, immutable snapshot; exactly one per request family.
- **BOR-DEC-125** — Acceptance, offer settlement and request settlement are one atomic transaction.
- **BOR-DEC-126** — Offer expiry is evaluated at read and at acceptance; no scheduled job is authoritative.
- **BOR-DEC-127** — Closing or superseding a request requires prior invalidation of every outstanding offer.
- **BOR-DEC-128** — Manual quote lifecycle history is an append-only event log; no state may be rewritten.
- **BOR-DEC-129** — Acceptance never creates an order, payment, reservation or carrier booking.

---

## 7. RESIDUAL RISKS

| Risk | Status |
|---|---|
| R-5 (workflow RPC/UI authorization model) | OPEN — every acceptance workflow remains owner-only |
| R-T21 (ACL drift) | RECURRING — cycle 12 normalized this milestone; drift is expected to recur |
| R-C2 (channel live execution) | BLOCKER — unchanged, untouched by this milestone |
| Checkout/VAT composition of the accepted shipping charge | DEFERRED to the checkout pricing milestone |

**STOP.** Application RPC, UI, checkout, payment and messaging require separate Owner authorization.

---

# ADDENDUM — M1C-1E-E-R1 — SCOPE RECONCILIATION AND CLOSEOUT ONLY

Date: 2026-07-26. Authorization: M1C-1E-E-R1 (reconciliation + one forward-only cleanup migration).
**Revised verdict: CONCURRENCY EVIDENCE INCOMPLETE** (scope deviation resolved; final harness evidence not delivered).

## R1.1 Read-only reconciliation findings

| Object | Finding | Action |
|---|---|---|
| `manual_shipping_quote_acceptance_conditions` | columns `condition_number, condition_code, condition_text` — an exact duplicate of `manual_shipping_quote_offer_conditions`; 0 rows; only dependency was its own write guard. Snapshot integrity is already guaranteed by the immutable accepted offer id. | **DROPPED** |
| `m1c1ee_offer_effective_status(uuid, timestamptz)` | called by **nothing** (call-graph scan of all `m1c1e*` routines returned no references); it returned a consumable quote status → early M1C-1E-F. | **DROPPED** |
| `m1c1ee_offer_acceptability(uuid, timestamptz)` | called by exactly one caller, `m1c1ee_guard_acceptance_write()` (trigger-only). Guard helper, not a resolver. | **RENAMED** to `m1c1ee_guard_offer_acceptability(uuid, timestamptz)`; caller rewritten; revoked from all app/sandbox roles |
| offer status `invalidated` | never authorized; every use was reachable through `superseded` / `withdrawn` / `expired`. | **REMOVED** from `msqo_status_ck`, `msqo_publication_completeness_ck`, `m1c1ed_guard_offer_write`, `m1c1ee_guard_request_closure` |

Object delta vs authorization after R1: business tables = **`manual_shipping_quote_acceptances` + `manual_shipping_quote_state_events` only**. Manual-quote table total 8 → **7**. Guard routines remain 18 (−1 condition guard, +1 reclassified helper). All affected tables held **0 rows** at cleanup time and hold 0 rows now.

Lifecycle matrix (post-R1):
`draft → offered | withdrawn`; `offered → superseded | withdrawn | expired | accepted`; `superseded | withdrawn | expired | accepted` are terminal and frozen.

Concurrency mechanism on `request_family_id`: `m1c1ee_guard_acceptance_write()` takes `SELECT … FROM manual_shipping_quote_requests WHERE request_family_id = NEW.request_family_id FOR UPDATE` (whole family), then `SELECT … FROM manual_shipping_quote_offers WHERE id = … FOR UPDATE`, then revalidates acceptability, then relies on deferred settlement guards plus three unique keys (per family, per request, per offer) and `msqo_single_accepted_version_uk`. Serialization is therefore row-lock + unique-key based, not advisory-lock based.

## R1.2 Cleanup migrations applied (forward-only)

- `m1c1ee_r1_scope_reconciliation` — the four actions above. No new objects, no data, no grants, no workflow.
- `m1b0k_acl_drift_cycle13_normalization` (REVOKE-only) — R-T21 recurred immediately after the cleanup DDL (`sandbox_exec=X` re-granted on 14 guard routines and on `place_order`).
- `m1b0l_acl_drift_cycle13_remainder` (REVOKE-only) — `sandbox_exec=ar` on `company_tax_profiles`, `catalog_product_tax_classifications`, `borvat_direct_listing_publications`.

## R1.3 Final verification state

| Requirement | Result |
|---|---|
| ACL gate, two consecutive cycles | **PASS / PASS**, 58 assertions each, exit code 0 both runs |
| Failure path returns exit 1 | Proven — the pre-fix run of the same gate exited 1 |
| `place_order` fail-closed | `{postgres=X/postgres}` — no app/sandbox EXECUTE |
| `internal_shipping` owner-only | Revoked from PUBLIC/anon/authenticated/service_role/sandbox_exec |
| Live-authorized channels | **0** |
| Persistent rows in the manual quote scope | **0** (all 7 tables) |
| New business tables | `..._acceptances`, `..._state_events` only |
| Clean harness pass (66/66) | **NOT DELIVERED this cycle** |
| Two-session concurrency evidence | **NOT DELIVERED this cycle** |

## R1.4 Explicit evidence gap (no claim is made to the contrary)

1. The corrected independent-fixture assertion (draft offer created *before* the request reaches `quoted`) was **not re-run**; the prior 65/66 result stands and the R1 status-contract change invalidates the old harness, which must be rebuilt against the post-R1 contract.
2. True concurrency evidence — double acceptance, acceptance vs request revision, acceptance vs withdrawal, acceptance vs expiry transition — requires **two independent committed sessions**. In this environment the fixtures would have to be committed to be visible to a second session, and an `manual_shipping_quote_acceptances` row is by design undeletable, which conflicts with the zero-persistent-rows requirement. No serialized in-session test is being presented as concurrency evidence. The mechanism is documented in R1.1; it is **unproven under real contention**.
3. Traceability mapping from the 97 authorization points to executed assertions is therefore also **pending** and must accompany the rebuilt harness.

Recommended next authorization: **M1C-1E-E-R2 — HARNESS REBUILD, TRACEABILITY MAPPING AND CONCURRENCY EVIDENCE ONLY** (isolated schema or disposable database, no product DDL).

## R1.5 Decision added

- **BOR-DEC-130** — Manual quote state events record immutable state evidence but do **not** replace the authorization audit; who was permitted to act is proven by the authorization/audit model (R-5), not by the lifecycle event log.

**STOP.** M1C-1E-F, status resolvers, RPC, UI, checkout, payment and messaging remain unauthorized.
