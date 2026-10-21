# PHASE 5 — M1C-1E-E-R3

## ACCEPTANCE SETTLEMENT REPAIR AND FAMILY SERIALIZATION HARDENING ONLY

Date: 2026-07-26
Scope: repair only. No new tables, columns, statuses, RPC, UI, payments, orders, reservations or carrier calls.
Verdict: **PASS** — P0 repaired, W1 closed, 44/44 harness assertions PASS, 4/4 concurrency scenarios PASS, ACL GATE PASS.

---

## 1. Authorization traceability

| Owner instruction | Delivered | Evidence |
|---|---|---|
| 1. Repair P0 (`m1c1ee_guard_acceptance_settlement`) | Done | Section 2, B22/B23, static scan S19 |
| 2. Repair W1 (family-level serialization via advisory transaction lock) | Done | Section 3, C1/C2, S20/S21 |
| 3. No new tables/columns/statuses, no RPC/UI | Respected | Section 6 |
| 4. Clean harness + static scan with zero references to dropped objects | Done | Sections 4 and 5 |
| 5. Concurrency C1–C4 | Done | Section 5 |
| ACL normalization before/after DDL | Done | Section 7 |

---

## 2. P0 — acceptance settlement defect (repaired)

**Defect.** After R1 dropped `manual_shipping_quote_acceptance_conditions`, the deferred constraint trigger
`m1c1ee_guard_acceptance_settlement()` still read that relation. Every acceptance therefore failed at
`COMMIT` with SQLSTATE `42P01` (undefined_table). The manual quote acceptance path was 100% non-functional
in production. Row counts confirm no acceptance ever succeeded (0 rows in every manual quote table).

**Repair.**
- Removed all references to the dropped relation from the settlement guard.
- The guard now validates only authorized invariants: the accepted offer is settled to `accepted`, the
  owning request is settled to `accepted`, every sibling offer in the family is terminal, and exactly one
  `acceptance_recorded` lifecycle event exists for the family inside the same transaction.
- Remains a `DEFERRABLE INITIALLY DEFERRED` constraint trigger, so settlement is still evaluated atomically
  at `COMMIT` rather than statement by statement.

Current production body digest (`md5(prosrc)`): `bd1ab7b0908c5cc8a76254ffc071d501`.

**Regression proof.** `B22` performs a fully legitimate acceptance end to end and asserts the deferred
triggers fire clean with no `42P01`. `B23` asserts the settlement guard still rejects an acceptance whose
lifecycle event is missing, so the repair did not weaken the invariant into a no-op.

---

## 3. W1 — family serialization (closed)

**Weakness.** Two sessions acting on the same `request_family_id` touched disjoint rows, so row locks alone
did not serialize them. A concurrent request revision could commit alongside an in-flight acceptance and
leave an orphan draft inside an accepted family.

**Repair — approved mechanism: transaction-level advisory lock on the family.**
- `public.m1c1ee_guard_family_lock(uuid)` — owner-only helper taking `pg_advisory_xact_lock` over a fixed
  namespace seed (4919) and the family identifier. Transaction-scoped, so it is released automatically at
  `COMMIT` or `ROLLBACK` and cannot leak across sessions.
- Every writer in the family takes the same lock in the same order before validating:
  `m1c1ee_guard_acceptance_write`, `m1c1ec_guard_request_write`, `m1c1ed_guard_offer_write`.
- Under the lock, acceptance re-validates that no prior acceptance exists and that the target request is the
  newest revision. Request writes reject any new version in an already accepted family with the explicit
  application SQLSTATE `BVQ01` / `request_family_already_accepted`.

Because all writers acquire a single lock on one key, there is no lock-ordering cycle. Zero deadlocks
(`40P01`) were observed across the full concurrency run; the suite fails explicitly if any appear.

---

## 4. Static scan — dropped objects

Executed against production `pg_proc` for schemas `public` and `internal_shipping`:

| Term | Occurrences |
|---|---|
| `manual_shipping_quote_acceptance_conditions` | 0 |
| `m1c1ee_offer_effective_status` | 0 |
| offer status `invalidated` | 0 |

Assertion `S19` encodes this scan permanently in the harness.

---

## 5. Verification results

Environment: disposable local PostgreSQL 17.9 clone, structurally zero-delta against production for the
shipping-quote scope, re-synchronized with the repaired R3 guards before the run.

**Harness — 44 assertions, 44 PASS, 0 FAIL.** Includes the new `S19`/`S20`/`S21` static assertions and the
`B22`/`B23` P0 regression assertions. `B06` and `B16` were re-baselined from generic errors to the now
stronger and more specific `BVQ01 request_family_already_accepted` contract.

**Concurrency — 4 scenarios, 4 PASS, 0 FAIL, 0 deadlocks.**

| ID | Scenario | Observed |
|---|---|---|
| C1 | Double acceptance of the same offer, two sessions | B blocks on A's family lock, then fails with `BVQ01 request_family_already_accepted`. Final state: 1 acceptance, 1 `acceptance_recorded` event, 1 accepted offer — no partial state. |
| C2 | Acceptance vs concurrent request revision | B blocks on the family lock (`57014` under a 2.5s timeout, proving the wait), and after A commits the replayed revision is refused with `BVQ01`. Final state: 1 acceptance, 0 orphan drafts, 1 accepted request. W1 closed. |
| C3 | Acceptance vs concurrent offer withdrawal | Withdrawal blocks on the lock; post-commit withdrawal is refused — terminal offers are historically frozen. Final offer status `accepted`. |
| C4 | Acceptance vs expiry transition | Acceptance past expiry is refused (`offer_expired`); after the expiry transition commits, acceptance is refused (`offer_not_published`). 0 acceptances. |

Residual rows in the clone after cleanup: 0 across all seven manual quote tables.
Persistent production rows: 0 across all seven manual quote tables.

---

## 6. Scope discipline

No table, column or status was added, altered or removed. No RPC, no UI, no checkout, payment, order,
inventory reservation, price locking, carrier booking, messaging or cron was introduced. The only new
database object is the owner-only advisory-lock helper explicitly required by the W1 remedy; it is recorded
in the gate inventory (18 post-R1 guards + 1 = 19) rather than hidden from it.

---

## 7. Security and ACL

- `M1B-0M` (REVOKE-only) applied after the R3 DDL. Its revokes were immediately reverted by the platform
  post-migration re-grant mechanism — R-T21, cycle 14, unchanged in nature and not caused by this phase.
- `M1B-0N` (REVOKE-only) re-applied the same normalization and held.
- ACL GATE: **PASS**, 58/58 assertions, failure path still exits 1.
- `anon`, `authenticated` and `service_role` hold zero privileges on every protected object; `place_order`
  remains executable by no application role. The advisory-lock helper is owner-only with an empty pinned
  `search_path` (`S20`, `S21`).
- Live-authorized channels: 0. No outbound call was made.

---

## 8. Residual risks

- **R-T21 (open, platform-level).** Any migration can trigger a blanket re-grant to the internal maintenance
  role. Mitigation stays mandatory: a REVOKE-only normalization plus a gate run must close every deployment.
- **R-Q1 (new, low).** Family serialization is advisory-lock based, so it protects only writers that pass
  through the guards. Direct owner-level writes bypassing triggers are not serialized. Acceptable while the
  path is owner-only and no application RPC exists; must be re-reviewed when M1C-1E-F exposes an RPC.
- **R-Q2 (new, low).** Under sustained contention on a single family, writers queue on one lock. No
  throughput concern at zero volume; revisit alongside the RPC and UI phase.
- R-5, R-S3, R-S4, R-C1, R-C2, R-T22 unchanged.

---

## 9. Requested closure

M1C-1E-E-R3 is submitted for review. No further work is authorized: the application RPC, expiry
scheduling, UI, checkout binding and order creation each require separate Owner authorization.
