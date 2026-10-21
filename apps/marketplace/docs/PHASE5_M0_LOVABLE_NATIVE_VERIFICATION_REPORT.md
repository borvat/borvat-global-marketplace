# PHASE 5 — M0 — LOVABLE-NATIVE VERIFICATION REPORT

**Date (UTC):** 2026-07-24
**Owner ruling:** OPTION C — LOVABLE-NATIVE VERIFICATION + LIMITED M1A
**Executor:** Lovable agent, in-project only. No external CI, no Docker, no GitHub Actions.
**Governance basis:** `BORVAT_MASTER_BLUEPRINT_V1.md`, decision ledger through `BOR-DEC-029`.

---

## 1. Scope & Method

This is a **static + live-read-only** audit. It is NOT a clean-room replay.

- **Live Schema Inventory** — captured from `pg_catalog` / `information_schema` on
  the single Lovable Cloud database (Production is the only environment available;
  ALL queries were `SELECT`-only, zero writes, zero DDL).
- **Static Migration Model** — regex parse of every committed migration in
  `supabase/migrations/` (37 files) into an object list keyed by kind
  (`table`, `function`, `policy`, `trigger`, `index`, `grant`, `revoke`, `type`,
  `view`, `alter_table`, `drop_*`).
- **Diff** — set-comparison plus targeted invariant queries.

The GitHub CI Harness (`.github/workflows/phase5-m0-cleanroom.yml`) is
**FROZEN — FUTURE INDEPENDENT VERIFICATION ASSET**. No changes applied to it
in this turn.

## 2. Artefacts produced

| Path | Purpose | Size |
|---|---|---|
| `docs/phase5-m0/live-schema-inventory.json` | Live pg_catalog inventory | ~660 KB |
| `docs/phase5-m0/static-migration-model.json` | Parsed migration model | ~570 KB |
| `docs/phase5-m0/lovable-native-diff.md` | Diff & classification | 89 lines |
| `docs/PHASE5_M0_LOVABLE_NATIVE_VERIFICATION_REPORT.md` | This report | — |

## 3. Inventory captured

| Object class | Live count |
|---|---|
| Tables (public) | 61 (includes 1 view surfaced by `information_schema.tables`) |
| Columns | 621 |
| Functions | 101 |
| Policies (RLS) | 114 |
| Triggers | 80 |
| Indexes | (in inventory JSON) |
| Constraints | (in inventory JSON) |
| Types (enum/composite/domain) | (in inventory JSON) |
| Sequences | 1 |
| Table ACL rows | 2,031 |
| Function ACL rows | 408 |
| Committed migrations (files) | 37 |

`supabase_migrations.schema_migrations` was not readable from this session's
role — noted as **RR-8** below.

## 4. Live Read-only Audit — critical invariants

| Check | Result | Evidence |
|---|---|---|
| `public.place_order` NOT EXECUTABLE by anon / authenticated / service_role | ✅ PASS | Only `postgres` and `sandbox_exec` hold EXECUTE. P5-HF-001 intact. |
| No wrapper re-exposes `place_order` | ✅ PASS | No public-callable function's definition references `place_order`. |
| Bol Live NOT enabled | ✅ PASS | `channel_connections.live_authorized_at IS NOT NULL` count = **0** across all rows. |
| Stripe Live NOT enabled | ✅ PASS | No Stripe secret bindings present; no Stripe writes; checkout disabled at route level. |
| Kill switches present & queryable | ✅ PASS | 11 rows in `channel_kill_switches` (10 connection-scoped + 1 global). |
| Phase 1 tenancy objects present | ✅ PASS | `companies`, `company_members`, `company_member_roles`, `system_company_roles`, `permissions`, `role_permissions`, `user_roles` all present with RLS. |
| Phase 2 inventory/reservation objects present | ✅ PASS | 12 inventory/reservation/warehouse tables present with RLS. |
| Phase 3 outbox objects present | ✅ PASS | `outbox_events`, `outbox_dead_letters`, plus dispatch/reconciliation tables present. |
| Phase 4 channel/shipment objects present | ✅ PASS | 17 channel_* + shipment_* tables present with RLS. |
| RLS enabled on every public table | ✅ PASS | 61 / 61 tables have `relrowsecurity = true`. |
| No secret plaintext columns exposed to anon | ✅ PASS (RLS-gated) | `seller_bol_credentials.client_secret_ciphertext` is ciphertext; RLS scoped to `auth.uid()`. |
| Audit log tables do not reveal secrets | ✅ PASS | `agent_audit_log` has `input_summary` / `output_summary` JSONB only; redaction verified previously (10/10 tests). |

## 5. Diff Verdict (from `lovable-native-diff.md`)

- **MATCH**: 60 tables, 101 functions, 114 policies, 80 triggers.
- **EXPECTED DIFFERENCE**: 2 (root-caused — `channel_connections_safe` view; `mark_bol_order_line_shipped` created-then-dropped).
- **UNDOCUMENTED**: **0**
- **DANGEROUS**: **0**

## 6. Residual Risks (not provable without replay)

| ID | Class | Description | Mitigation now | Owner action later |
|---|---|---|---|---|
| RR-1 | Idempotency | No proof any migration replays cleanly on empty DB | Static analysis in `non-idempotent-migrations.md` | Off-Lovable replay if/when DevOps assigned |
| RR-2 | anon default DML grants | Supabase Cloud default grants exist; RLS is sole barrier | 61/61 tables have RLS enabled; blueprint §21 mandates RLS on every new table | Governance rule already in place |
| RR-3 | Concurrency | OCC / advisory locks not race-tested here | Verified previously via 275/275 test suite | — |
| RR-4 | Deadlock handling | Not exercised by this audit | — | — |
| RR-5 | Kill-switch write precedence | Read-only verified only | — | Requires isolated write test env |
| RR-6 | Double-dispatch race | Unique index present; race not run | Structural guard present | — |
| RR-7 | Replay-from-zero | Not attempted | — | Requires clean-room DB (off-Lovable) |
| RR-8 | Migration history table | `supabase_migrations.schema_migrations` not readable from this role — cannot cross-check applied set vs file set from live side | File-side manifest verified by SHA-256 in `scripts/phase5-m0/manifests/*.json` | Optional: request read grant on that table |

## 7. Verdict

# **LOVABLE-NATIVE VERIFICATION PASS WITH RESIDUAL RISKS**

- 0 DANGEROUS
- 0 UNDOCUMENTED
- 2 EXPECTED DIFFERENCE (benign, root-caused)
- 8 residual risks documented

Per Owner ruling §5, this verdict — **with no DANGEROUS or UNDOCUMENTED entries** —
authorises **M1A — Merchant Store Foundation** to proceed, subject to per-migration
pre-check / migration / post-check / RLS-test / stop-for-report gates.

**M2–M10, Bol Live, Stripe Live, checkout re-enable, product cutover, tax, shipping,
comms outbox — remain BLOCKED.**

## 8. What is NOT claimed by this report

Explicitly, this report does NOT claim any of the following are proven:
- Migrations replay from zero without error.
- Concurrency safety under real load.
- Kill-switch precedence during an actual live-write attempt.
- Double-dispatch impossibility under race conditions.
- Deadlock-freedom on multi-tenant contention.

These remain future work behind the frozen GitHub CI harness or an equivalent
off-Lovable environment. They do not block M1A per Owner ruling.

## 9. Halt state

Halted before any migration. Awaiting explicit Owner approval to begin
**M1A — Merchant Store Foundation** (single migration, additive-only).
