# PHASE 5 — M1C-1E-E-R2 — HARNESS REBUILD, TRACEABILITY AND CONCURRENCY EVIDENCE

Date: 2026-07-26
Authorization: M1C-1E-E-R2 — evidence only. No product DDL was applied to production.
Verdict: **FAIL — P0 DEFECT IN PRODUCTION (acceptance is impossible)**

---

## 1. ENVIRONMENT

Disposable PostgreSQL 17.9 instance (socket `/tmp/r2`, port 5599), loaded from a
structural clone of the production shipping-quote scope. Zero-delta structural
fidelity for the scope was proven before testing. No production migration, no
production data, no production role change was made in this milestone.

---

## 2. P0 DEFECT — ACCEPTANCE IS IMPOSSIBLE IN PRODUCTION

The rebuilt harness executed the happy path first, and it failed at commit:

```
ERROR:  relation "public.manual_shipping_quote_acceptance_conditions" does not exist
SQLSTATE 42P01
CONTEXT: PL/pgSQL function public.m1c1ee_guard_acceptance_settlement() line 18
```

**Root cause.** `M1C-1E-E-R1` dropped
`public.manual_shipping_quote_acceptance_conditions` (correctly — it was out of
scope), but `m1c1ee_guard_acceptance_settlement()` still counts rows in that
table. The guard is a DEFERRED constraint trigger, so the failure occurs at
`COMMIT`, not at `INSERT`. Every acceptance transaction therefore aborts.

**Why R1 did not catch it.** R1 delivered no runtime acceptance test; the
reconciliation checked the call graph of `m1c1e*` routines for references to the
dropped *function*, not for references to the dropped *table*. PostgreSQL does
not track table dependencies inside `plpgsql` bodies, so the `DROP TABLE`
succeeded silently.

**Severity.** P0 for the milestone's core invariant, but **zero production
impact today**: there is no RPC and no UI, the tables are owner-only with RLS
forced and no policies, and all seven manual-quote tables hold 0 rows. Nothing
can currently reach the broken path.

**Not fixed in this milestone** — R2 authorizes evidence only. A one-statement
`CREATE OR REPLACE` repair is drafted and was applied **to the disposable clone
only** so the remaining evidence could be produced. Production is untouched and
still broken.

Recommended next authorization: **M1C-1E-E-R3 — ACCEPTANCE SETTLEMENT GUARD
REPAIR ONLY** (single forward-only `CREATE OR REPLACE`, no schema change, no
data, no grants), followed by a re-run of this harness against production.

---

## 3. REBUILT HARNESS — 39/39 PASS

Rebuilt against the post-R1 contract. Every assertion uses its own connection
and its own transaction, and **every transaction is rolled back**. Deferred
triggers are forced with `SET CONSTRAINTS ALL IMMEDIATE`, which proves
commit-time invariants without committing. No guard was disabled or bypassed.

- **S01–S18** — static contract: dropped table absent, dropped resolver absent,
  helper reclassified, six-value offer status contract with no `invalidated`
  residue in any guard body, 7-table scope, only two new business tables, RLS
  enabled *and forced* with zero policies, empty `search_path` on all 18 guards,
  all four unique keys, deferred settlement trigger, and no order / payment /
  reservation / label / tracking / test-bypass column.
- **B01–B21** — runtime: happy path; acceptance immutable and undeletable; state
  events append-only; second acceptance refused; expired, draft, withdrawn and
  superseded offers unacceptable; acceptance without offer *or* request
  settlement fails at commit; offer/request cannot reach `accepted` without an
  acceptance; charge, version and owning buyer must match exactly; accepted
  family closed to new versions; accepted request terminal; request closure
  requires all outstanding offers closed first; no commerce artefact produced.

Result: **39 assertions, 39 PASS, 0 FAIL.** Residual rows after the run: **0**
in all seven manual-quote tables.

---

## 4. CONCURRENCY EVIDENCE — 4/4 PASS, TWO COMMITTED SESSIONS

Real concurrency: the fixture is committed by a setup session so a second
backend can see it, then two independent transactions interleave. Fixtures are
force-removed afterwards with `session_replication_role='replica'` — the only
guard bypass used anywhere in this milestone, used solely to delete
by-design-undeletable rows from the disposable clone.

| # | Scenario | Observed |
|---|---|---|
| C1 | double acceptance, same offer | B **blocks** on A's `FOR UPDATE` family lock (cancelled at 2.5 s, SQLSTATE 57014). After A commits, B's replay is refused on merit (`offer_not_published`). Exactly **1** acceptance. |
| C2 | acceptance vs request revision | Acceptance wins; the accepted family is closed to new request versions (`M1C1EE: … closed to new versions`). 1 acceptance. **See weakness W1.** |
| C3 | acceptance vs offer withdrawal | Withdrawal **blocks** on the acceptance's offer row lock (57014); after commit it is refused (`terminal offers are historically frozen`). Final offer status `accepted`. |
| C4 | acceptance vs expiry transition | Read-time expiry refuses acceptance (`offer_expired`); the merchant's expiry transition commits; a later acceptance is still refused. **0** acceptances. |

Serialization is row-lock + unique-key based (family `FOR UPDATE`, then offer
`FOR UPDATE`, then re-validation, then deferred settlement guards and four
unique keys). C1 and C3 are the first direct evidence that the lock actually
blocks a second backend rather than merely being present in the source.

### W1 — residual weakness found by C2

A **new** request version inserted concurrently is not blocked by the family
`FOR UPDATE` (row locks do not block inserts), so a `draft` v2 row can be
committed alongside an in-flight acceptance. Post-acceptance the family is
correctly closed, and submitting the surviving draft failed — but it failed on
`M1C1EC: at least one request item is required on submission`, i.e. on an
unrelated completeness rule, **not** on the accepted-family rule. An orphan
draft in an accepted family is therefore reachable, and its refusal on
submission is currently incidental rather than by design. Recommend a
`request_family_id` advisory lock or an accepted-family check in the request
submission guard. Not fixed here (evidence-only scope).

---

## 5. TRACEABILITY

Machine-readable evidence: `harness_results.json` (39 rows: id, authorization
point, kind, description, result, SQLSTATE/message) and
`concurrency_results.json` (4 rows: id, expectation, observation, result).
Every assertion carries the authorization point it discharges. The authorization
points not discharged by this run are exactly those covering the acceptance
settlement guard's production behaviour — blocked by the P0 defect in §2.

---

## 6. RESIDUAL RISKS

| Risk | Status |
|---|---|
| **P0 acceptance settlement guard** | **OPEN — production acceptance is impossible; repair needs R3** |
| W1 orphan draft in an accepted family | OPEN — incidental refusal only |
| `offer_invalidated` still present in `msqse_event_ck` | OPEN — residue of the removed status; harmless, no writer emits it |
| R-5 (workflow authorization model) | OPEN — everything remains owner-only |
| R-T21 (ACL drift) | RECURRING — no ACL change made this milestone |
| R-C2 (channel live execution) | BLOCKER — untouched |

**STOP.** M1C-1E-F, status resolvers, RPC, UI, checkout, payment and messaging
remain unauthorized. The only recommended next step is R3, the guard repair.
