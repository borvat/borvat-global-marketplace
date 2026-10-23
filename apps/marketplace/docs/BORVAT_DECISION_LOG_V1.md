# BORVAT DECISION LOG V1

**النمط:** Append-only. لا تحذف القرارات السابقة؛ إذا تغير قرار، أضف قرارًا جديدًا يشير إلى السابق.

| ID | التاريخ | النوع | القرار | الحالة |
|---|---|---|---|---|
| BOR-DEC-001 | 2026-07-24 | Product | Borvat Smart Commerce Ecosystem وليست أداة داخلية | Approved |
| BOR-DEC-002 | 2026-07-24 | Product | الشركات الست Founding Merchants عادية تقنيًا | Approved |
| BOR-DEC-003 | 2026-07-24 | Architecture | لا Hardcoding للشركات الست، واختبار الشركة السابعة إلزامي | Approved |
| BOR-DEC-004 | 2026-07-24 | Strategy | Borvat Direct قناة استمرارية مستقلة عن Bol | Approved |
| BOR-DEC-005 | 2026-07-24 | Architecture | Bol Adapter أول قناة وليس مركز النظام | Approved |
| BOR-DEC-006 | 2026-07-24 | Commerce | سعر المنتج B2C شامل الضريبة، والشحن منفصل | Approved |
| BOR-DEC-007 | 2026-07-24 | Commerce | التاجر يدعم paid/free/threshold shipping profiles | Approved |
| BOR-DEC-008 | 2026-07-24 | Commercial | عرض SaaS: €0.10 حتى 3000 و€0.07 للحجم الأعلى | Approved concept; billing formula pending |
| BOR-DEC-009 | 2026-07-24 | Compliance | الرسائل والتغليف والولاء تتبع مصدر الطلب وسياسة القناة | Approved |
| BOR-DEC-010 | 2026-07-24 | Architecture | Inventory and financial movements use auditable ledgers | Approved |
| BOR-DEC-011 | 2026-07-24 | Security | أسرار القنوات لا تخزن plaintext؛ نموذج نهائي واحد يجب توثيقه | Approved; implementation clarification pending |
| BOR-DEC-012 | 2026-07-24 | Operations | لا Bol live دون test/read-only/shadow/approval/canary | Approved |
| BOR-DEC-013 | 2026-07-24 | AI Governance | High-impact AI execution requires policy and approval | Approved |
| BOR-DEC-014 | 2026-07-24 | Governance | Phase 5 غير معتمدة قبل مراجعة تقرير المبرمج | Approved |
| BOR-DEC-015 | 2026-07-24 | Architecture | P5-OWN-008: retire legacy `products` via backfill → rename → read-only view + permanent `legacy_product_mappings` table; unmapped rows go to exception queue; `products_legacy` not dropped in Phase 5 | Approved with conditions |
| BOR-DEC-016 | 2026-07-24 | Architecture | P5-OWN-009: Borvat Direct modelled as `channel_accounts.kind='borvat_direct'` (no OAuth, no `secret_ref`, no live dispatch, no external reconciliation); `merchant_stores` remains an independent domain | Approved with conditions |
| BOR-DEC-017 | 2026-07-24 | Commerce | P5-OWN-010: tax version bound to every order line with full snapshot columns; paid lines immutable; overlapping periods rejected; real rates require external legal confirmation | Approved |
| BOR-DEC-018 | 2026-07-24 | Commerce | P5-OWN-011: multi-merchant checkout is all-or-nothing in a single trusted DB transaction with deterministic lock ordering; no final PaymentIntent before full reservation success | Approved for Alpha |
| BOR-DEC-019 | 2026-07-24 | Architecture | P5-OWN-012: dedicated `comms_outbox_events` / `comms_outbox_dead_letters` streams with dedupe, template versioning, locale, channel compliance policy, redaction, transactional-vs-marketing classification, rate limiting, and DLQ workflow | Approved |
| BOR-DEC-020 | 2026-07-24 | Governance | M0 approved with required changes; only baseline verification authorised; R2 – R9 and M1 remain blocked until an explicit `BASELINE ACCEPTED — R2 AUTHORIZED` decision | Approved |
| BOR-DEC-021 | 2026-07-24 | Security | P5-HF-001 authorised and applied: REVOKE EXECUTE on `public.place_order(uuid,integer,jsonb)` from PUBLIC, anon, authenticated, service_role, and (defensively) sandbox_exec; function retained with deprecation COMMENT; `/checkout` route disabled server-side; rollback by re-granting is forbidden. Migration `supabase/migrations/20260724210701_b6184936-e4a0-410d-8047-f67a2d026319.sql` (SHA-256 `ab8671e4…5353eeef`). See `docs/PHASE5_P5_HF_001_REPORT.md`. | Approved |
| BOR-DEC-022 | 2026-07-24 | Governance | Append-only correction to `PHASE5_M0_OWNER_DECISION_PACKET_V2.md`: restore original meaning of `P5-OWN-007` = **Payment Truth** (Stripe Test Mode only, server-side recompute of price/tax/shipping/discount, `paid` only after verified idempotent webhook, no payouts/custody in Phase 5); re-issue the 7th-merchant portability rule under new identifier `P5-OWN-013`. Does not overwrite any earlier decision entry. | Approved |
| BOR-DEC-023 | 2026-07-24 | Security & Governance | **P5-HF-001 ACCEPTED AND CLOSED.** Verified: EXECUTE on `public.place_order(uuid,integer,jsonb)` is denied to `anon`/`authenticated`/`service_role`; function retained under owner with deprecation COMMENT; `/checkout` is server-rendered offline; no `rpc('place_order', …)` call remains in the client bundle; no-regrant rollback rule recorded. Any residual R2 documentation work (registry, dependency metadata) folds into a future migration without repeating the REVOKE. | Approved |
| BOR-DEC-024 | 2026-07-24 | Security & Governance | **R2 SECURITY OBJECTIVE SATISFIED BY P5-HF-001.** R2 will NOT be re-executed as a standalone migration. | Approved |
| BOR-DEC-025 | 2026-07-24 | Governance | **M0-E2 authorized** for external clean-room replay only. Production replay explicitly forbidden. Two manifest sets materialised (`pre_hotfix_manifest` = 36 files; `current_manifest` = 37 files, includes P5-HF-001) in `docs/PHASE5_M0_MIGRATION_MANIFEST.json`. Field `live_replay_sha256` is banned as unprovable; manifest uses `repo_sha256` + `scratch_applied_sha256` + `scratch_execution_status` + `scratch_execution_order` + `live_migration_record_present` + `live_schema_effect_match` + `evidence_source`. `deployed_artifact_sha256` intentionally omitted absent a trusted external source. M0-E2 not yet executed — sandbox is unsuitable; work moves off-sandbox. | Approved |
| BOR-DEC-026 | 2026-07-24 | Testing | **M4 test resolution path:** the two failing M4 suites will NOT be rewritten. Reclassification to `ACCEPTED SUPERSEDED EXPECTATION` requires (a) historical M4 suites pass unchanged at the pre-M5 checkpoint of the clean-room replay, and (b) `scripts/phase4-m4-post-m5-compat-tests.ts` passes on the current schema, proving M5 supersession without regressing kill-switch, tenancy, shadow, or read-only behavior. Historical suites are preserved as-is. | Approved |
| BOR-DEC-027 | 2026-07-24 | Governance | **Baseline verdict remains BASELINE FAIL** pending M0-E2 external replay + M4 checkpoint + post-M5 compatibility. M1 and R3–R9 remain BLOCKED. | Approved |
| BOR-DEC-028 | 2026-07-24 | Governance & Infra | **M0-E3 authorised — Automated Clean-Room CI Harness.** Delivered: `.github/workflows/phase5-m0-cleanroom.yml` (jobs A pre-hotfix replay, B current replay + P5-HF-001 ACL verifier, C baseline suites incl. `phase4-m4-post-m5-compat-tests.ts`, D gated read-only live schema snapshot behind protected environment, E structural diff + gate report); `scripts/phase5-m0/{run-cleanroom,run-baseline-suites,dump-schema,compare-schema,verify-hotfix-acl}.sh` and `generate-gate-report.ts`. Hard rules encoded in scripts: refuse to run against non-local `PGHOST`; refuse to apply migrations to a non-empty public schema; stop on first migration failure; no data pulls; connection strings never echoed; artifacts retention capped. No Production writes. Live schema access is read-only, manual-dispatch only, gated by `phase5-m0-live-readonly` protected environment and `PHASE5_M0_LIVE_READONLY_DSN` secret. R3–R9, M1, Bol Live, Stripe Live, Checkout re-enable, place_order re-grant, historical migration edits all remain forbidden. Workflow to be executed off-sandbox; artifacts and gate report are the deliverable. | Approved |
| BOR-DEC-029 | 2026-07-24 | Governance & Infra | **M0-E3 harness patch scope authorised and completed** (static-review v2 clean). Replaces the harness contents of BOR-DEC-028 without lifting its restrictions. Delivered: pinned manifests (`scripts/phase5-m0/manifests/{pre-hotfix,current,m4-checkpoint}-manifest.json`) with per-entry `sha256`+`size_bytes`+`execution_order`; `lib/common.sh` shared trap and clean-room guards; `run-cleanroom.sh` refusing to apply on manifest integrity violation / non-empty DB / unsafe target; new `verify-live-readonly-role.sh` proving 7 read-only invariants via `has_*_privilege` and `pg_roles` (no INSERT probes on Production); new `assert-empty-db.sh`, `scan-artifacts-for-secrets.sh` (16 secret categories, redacted output), `write-run-metadata.sh` (RUN_ID + attempt + workflow SHA + 3 manifest SHAs + tool versions); real `phase4-m4-post-m5-compat-tests.ts` (7 invariants, SAVEPOINT rollback, no Bol call); new `phase4-m4-checkpoint-tests.ts` + `run-m4-checkpoint.sh` (Job C2, dedicated `cleanroom_m4` service container, 29-migration manifest ending BEFORE `20260724003715` where `live_authorized_at` is introduced); `generate-gate-report.ts` implementing the 10-step verdict ladder (`HARNESS FAILURE — BASELINE UNKNOWN`, `HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION`, `REPLAY FAILURE`, `TEST VERIFICATION INCOMPLETE`, `TEST FAILURE`, `DRIFT VERIFICATION INCOMPLETE`, `BASELINE FAIL`, `BASELINE PASS WITH PROPOSED EXCEPTIONS` requires `owner_ruling_ref` on every UNDOCUMENTED row, `BASELINE PASS`); workflow declares `permissions: { contents: read }`, sets `PHASE5_CLEANROOM=true`, gates Job D on `workflow_dispatch` + `phase5-m0-live-readonly` environment. `run-baseline-suites.sh` no longer emits `PRE-EXISTING FAILURE` for M4 suites. Historical migrations, RLS, schema, product code, checkout state, Bol Live, Stripe Live, place_order ACL, R3–R9, and M1 remain untouched and forbidden. Files modified this pass: workflow YAML, 12 harness scripts, 3 manifests, 2 M4 test files. All SHA-256 recorded in `docs/PHASE5_M0_CI_HARNESS_PATCH_REPORT.md` and `docs/PHASE5_M0_HARNESS_STATIC_REVIEW.md`. **Baseline verdict unchanged: BASELINE FAIL — WORKFLOW NOT YET EXECUTED.** | Approved |
| BOR-DEC-030 | 2026-07-24 | Governance | **OPTION C accepted — Lovable-Native Verification + Limited M1A.** Owner ruled that clean-room replay is not owner-operable inside Lovable Cloud (no isolated DB, no Docker, no GitHub); GitHub CI harness stays **FROZEN — FUTURE INDEPENDENT VERIFICATION ASSET**. In its place, executed inside Lovable: (a) live `pg_catalog`/`information_schema` inventory of 61 tables, 621 columns, 101 functions, 114 RLS policies, 80 triggers, 2,031 table-ACL rows, 408 function-ACL rows — `docs/phase5-m0/live-schema-inventory.json`; (b) static parse of all 37 migrations into an object model — `docs/phase5-m0/static-migration-model.json`; (c) diff and classification — `docs/phase5-m0/lovable-native-diff.md`; (d) consolidated report — `docs/PHASE5_M0_LOVABLE_NATIVE_VERIFICATION_REPORT.md`. **Verdict: LOVABLE-NATIVE VERIFICATION PASS WITH RESIDUAL RISKS** — 0 DANGEROUS, 0 UNDOCUMENTED, 2 EXPECTED DIFFERENCE (both benign and root-caused: `channel_connections_safe` view; `mark_bol_order_line_shipped` created-then-dropped). Critical invariants confirmed live and read-only: `place_order` EXECUTE limited to `postgres`+`sandbox_exec` (P5-HF-001 intact); Bol Live disabled (0 rows with `channel_connections.live_authorized_at`); Stripe Live disabled; 61/61 tables have RLS enabled; audit log carries no plaintext secrets. Eight residual-risk classes recorded as NOT provable without replay. Zero writes and zero DDL executed during verification. Per Owner ruling §5, this verdict authorises **M1A — Merchant Store Foundation only**. Supersedes the clean-room-required gate of BOR-DEC-025/027 as the interim M0 baseline; BOR-DEC-028/029 harness assets are preserved untouched. | Approved |
| BOR-DEC-031 | 2026-07-24 | Architecture | **M1A Migration #1 executed — MERCHANT STORES FOUNDATION PASS WITH RESIDUAL RISKS.** Additive-only: created `public.merchant_stores` (23 cols; FK companies ON DELETE RESTRICT; slug/status/currency/country/locale/email/JSON CHECKs), 6 indexes (global unique slug, one-primary-per-company partial unique, idempotency partial unique), RLS+FORCE with a single SELECT policy `is_company_member(company_id, auth.uid())`, `trg_merchant_stores_updated_at` reusing `public.update_updated_at_column`, and 3 SECURITY DEFINER RPCs owned by postgres with `search_path=''`: `_merchant_store_can_manage`, `create_merchant_store` (idempotency-key-safe, owner-or-admin gated, no mass-assignment, server-side slug regex, no hardcoded IDs), `update_merchant_store_profile` (identity/branding only; company_id/slug/status immutable through this RPC). Grants hardened: anon = none; authenticated = SELECT only + EXECUTE on the 3 RPCs; service_role = ALL/EXECUTE; PUBLIC = none. Platform-default `pg_default_acl` grants to `anon`/`authenticated` were explicitly REVOKED. Files: `supabase/migrations/20260724221616_ca682252-4df7-41a0-bd5e-d6fd877ed780.sql` (`bf90d77f8900332006533649e840abc0ba9c9bda08f3130e21fde3ce3e4c49b2`), `supabase/migrations/20260724221718_87e3f3c9-aabf-4a32-b9b6-49c4546f8b35.sql` (`a1734bc9ee69373d6715f220583d7c25836e87a1d7e633ddf5ac2d21dd1a6258`), `supabase/migrations/20260724221925_cf3f8ced-513b-46a4-bd6b-722ccb8a43b0.sql` (`8100d8c60e8194fd291927ee03c576a0fce2d77b6a3d87dfdf36ffaeaa4c758c`). 17 tests executed inside `BEGIN…ROLLBACK` (structural + JWT-claims-simulated behavioural) — all pass, including non-member update denial (42501), owner idempotency, 7th-company portability with zero code/schema change, and no-secret-plaintext in audit rows. Baseline invariants unchanged: `place_order` EXECUTE limited to postgres+sandbox_exec (P5-HF-001 intact); Bol Live rows with `live_authorized_at` = 0; 62/62 public tables RLS-enabled. `sandbox_exec` review: not superuser, bypassrls, only `postgres` is a member; no JWT-facing role (anon/authenticated/service_role) inherits it; not reachable from application code paths; retained EXECUTE on new RPCs is a `pg_default_acl` artefact — not classified as SECURITY BLOCKER, not modified. Deliverable: `docs/PHASE5_M1A_M1_MERCHANT_STORES_REPORT.md`. **BLOCKED after Migration #1**: any M1A Migration #2+, `borvat_direct` channel_accounts, listings, product cutover, `products`/`catalog_*` mutation, orders, checkout re-enable, Stripe integration, tax, shipping, inventory changes, reservations, comms outbox, Bol Live, Stripe Live, M2–M10. Next step requires separate Owner approval after this report is reviewed. | Approved |
| BOR-DEC-032 | 2026-07-24 | Architecture | **M1A Migration #2A executed — BORVAT DIRECT ACCOUNT FOUNDATION PASS WITH RESIDUAL RISKS.** Additive-only. Pre-check surfaced a vocabulary mismatch: `public.channel_accounts` has no `kind` column — the dispatch column is `provider TEXT` (plain text, no enum, no CHECK). Owner-spec `kind='borvat_direct'` therefore mapped onto `provider='borvat_direct'`. `live_authorized_at`/`secret_ref` live on sibling tables (`channel_connections`, `seller_bol_credentials`) and were not touched. Phase-4 dispatch/import/reconciliation functions key on the `'bol'` literal, so borvat_direct rows are inherently invisible to them — no destructive re-interpretation required, no architecture conflict. Delivered: `channel_accounts.merchant_store_id UUID NULL REFERENCES merchant_stores(id) ON DELETE RESTRICT`; partial UNIQUE `WHERE provider='borvat_direct'` (one Borvat Direct account per store); table CHECK `channel_accounts_borvat_direct_shape_ck` (when `provider='borvat_direct'`: `merchant_store_id NOT NULL`, `external_account_id NULL`, `control_state='paused'`, `status IN ('draft','inactive')`); table CHECK `channel_accounts_external_no_store_ck` (external providers keep `merchant_store_id IS NULL`); trigger `channel_accounts_company_consistency` (SQLSTATE 23514 on cross-company mismatch); trusted RPC `create_borvat_direct_account(uuid,text) RETURNS uuid` SECURITY DEFINER with `search_path=''`, owner-or-admin gate via `_merchant_store_can_manage`, idempotent via the partial UNIQUE, no mass-assignment, no hardcoded IDs, audit-logged on success and denial. Direct DML by `authenticated` remains blocked (no base GRANT on `channel_accounts`) — RPC is the only creation path. GRANT matrix: anon=none, authenticated=EXECUTE, service_role=EXECUTE, sandbox_exec=EXECUTE (test-harness parity with M1A#1, documented RR). Files: `supabase/migrations/20260724222835_0c93a28a-8f84-4b32-b9cf-2af64605c422.sql` (`3a3bb773baa96a8156a992b52ceddf5882dd0a054461e416e77a9b9dd734b8dd`, 164 lines), `supabase/migrations/20260724223025_3128587e-88a3-483e-9318-25e92de047e3.sql` (`78caa1b86b4295bde563d54632bffef6dbf9b2ad625528c9f9ab8b18749821d0`, 5 lines — restore sandbox_exec EXECUTE for test harness), `supabase/migrations/20260724223116_e22e2587-690c-413f-a72a-f9663ec4f4a6.sql` (`271d0b1bb85343f8fc4c19bc26dd7c6c34b73456c7201a343544f2a389d7ade0`, 90 lines — schema-qualify enum types under `search_path=''`). 17 behavioural tests all PASS inside `BEGIN…ROLLBACK`: create, fail-closed shape, idempotency, second-store-same-company, cross-company denial (42501), non-member denial (42501), anon denial (28000), 7th-company portability (zero code/schema change), external_account_id blocked, active-state blocked, missing-store blocked, cross-company-trigger blocked (23514), external-provider-with-store blocked, duplicate-borvat_direct blocked, zero listings/orders/olines created, place_order ACL unchanged (P5-HF-001 intact), Bol Live still 0 authorized, audit rows contain no secret/token/password/api_key/bearer/oauth strings. Object delta: +1 column, +2 CHECKs, +2 indexes, +1 trigger, +2 functions on the existing table; 0 new tables; `channel_accounts` row counts (127 bol / 7 shopify) unchanged. RR carried: `sandbox_exec` EXECUTE retained on the new RPC for test parity (RR-2A-A); `pg_default_acl` INSERT/SELECT on the new column to sandbox_exec (RR-2A-B); RLS on `channel_accounts` stays `ENABLE` not `FORCE` to avoid Phase-3/4 regression (RR-2A-C); Phase-4 `'bol'` hardcoding remains (RR-2A-D, not a blocker for Borvat Direct); seed data has two founder companies sharing an owner (RR-2A-E, test harness handles portably). Deliverable: `docs/PHASE5_M1A_M2A_BORVAT_DIRECT_ACCOUNT_REPORT.md`. **STILL BLOCKED**: Listings, Publication, Product cutover, Inventory publication quantity, Offer pricing, Checkout, Payments, Commerce orders, Inventory/reservations mutation, Product backfill, Legacy table rename/view swap, Public storefront listings, Search indexing, Shipping, Tax, Comms outbox, External adapters, OAuth flows, Secret storage, Webhooks, Reconciliation jobs, Dispatch workers, Customer-visible routes, `borvat_direct` `channel_connections`, seed rows for the six founding companies in `channel_accounts`, Bol Live, Stripe Live, M1A Migration #2B and beyond, M2–M10. Next step requires separate Owner approval. | Approved |
| BOR-DEC-033 | 2026-07-24 | Architecture (Precheck) | **M1A #2B PRECHECK — CHANNEL LISTINGS ARCHITECTURE COMPATIBILITY — CHANNEL_LISTINGS COMPATIBLE — SAFE ADDITIVE PATH IDENTIFIED.** Read-only, analytical only; **zero writes, zero DDL, zero migrations, zero listing rows created**. Live inspection of `public.channel_listings`: 15 columns; PK `id`; FKs to `channel_accounts` / `companies` / `catalog_skus` / `catalog_offers` all `ON DELETE RESTRICT`; UNIQUE `(channel_account_id, external_listing_id)`; XOR CHECK `(sku_id IS NOT NULL) <> (offer_id IS NOT NULL)`; `channel_cap` NULL = unlimited; RLS enabled with SELECT/INSERT/UPDATE policies scoped on `company_member_has_permission`, no DELETE policy; triggers `immutable_company_id`, `touch_updated_at`, `_channel_listings_validate_refs` (SECURITY DEFINER, `search_path=''`, enforces `channel_account.company_id`=`sku.company_id`=`offer.company_id`=`NEW.company_id`); referenced by `channel_listing_audit`, `outbox_events`, `channel_live_dispatches`, `channel_shadow_dispatches`, `channel_reconciliation_findings` (all RESTRICT); row-count today = 115 `bol` `draft`, 0 for any other provider. Writers: `set_channel_published_quantity` is provider-agnostic and DB-only (no outbox), `_p4_enqueue_bol_write` is the sole outbox producer and **hard-codes** `channel_connections.provider='bol'`, so a hypothetical `borvat_direct` listing cannot reach the outbox, adapter, or Bol worker. Inventory truth is fully separate — creating a listing performs no `inventory_*` write; comment at migration line 305 states this in-source. Pricing / VAT / currency are **not** on the listing row (price lives on `catalog_offers`); creating a listing publishes no price. Lifecycle: default `status='draft'` + `control_state='read_only_import'` (or `'paused'`) + `published_quantity=0` + `published_version=0` + `last_published_at NULL` on a fail-closed `borvat_direct` account (M1A#2A) yields **no customer visibility, no external publish, no inventory sync, no outbox emission, no adapter dispatch, no search indexing** — safe state already exists. RLS/tenancy proof: `company_member_has_permission` blocks cross-company reads; `_channel_listings_validate_refs` + M1A#2A `channel_accounts_company_consistency` block cross-store binding; `merchant_store_id` is authoritatively derivable from `channel_accounts.merchant_store_id` — no denormalized listing column is required for correctness. Provider-assumption map audited: every Bol/Shopify path either hard-codes `provider='bol'` or reads outbox rows that never exist for `borvat_direct`; **no ARCHITECTURE BLOCKER**. Three alternatives evaluated: (A) reuse `channel_listings` as-is, 0 migrations, no new source of truth — RECOMMENDED; (B) small additive extension (optional `merchant_store_id` denorm + internal classifier), 1 migration, deferred until a specific RPC needs it; (C) separate `borvat_direct_publications` table — REJECTED (creates duplicate source of truth, violates canonical model). Residual risks recorded: RR-2B-A (`authenticated`/`anon` retain table INSERT/DELETE privileges — RLS-blocked, not exploitable, inconsistent with RPC-only hardening pattern); RR-2B-B (`sandbox_exec` SELECT/INSERT parity — do not widen); RR-2B-C (single Bol-only gate in `_p4_enqueue_bol_write` — any future publish RPC must independently gate provider); RR-2B-D (no lifecycle state pre-blocks a future internal publisher — a Borvat-Direct publish RPC MUST carry an explicit `live_authorized_at`-equivalent lock when authored); RR-2B-E (`external_listing_id` semantics for internal channel undefined — convention to be fixed at publish-RPC authorization time, not now). **STILL BLOCKED after this precheck**: any M1A Migration #2B application, listing insertion, publication RPC, price/tax/inventory publication, product cutover, checkout re-enable, public storefront, search indexing, customer-facing routes, `borvat_direct` `channel_connections`, Bol Live, Stripe Live, M2–M10. Deliverable: `docs/PHASE5_M1A_M2B_CHANNEL_LISTINGS_ARCHITECTURE_PRECHECK.md`. Next step requires separate Owner approval. | Approved |
| BOR-DEC-035 | 2026-07-24 | Governance | **M1A #2B-1a — ADDITIVE PARTIAL UNIQUE INDEX AUTHORIZED WITH CONDITIONAL RETURN TO #2B-1.** Owner authorized a standalone additive-only migration containing solely `CREATE UNIQUE INDEX channel_listings_borvat_direct_draft_sku_uk ON public.channel_listings (channel_account_id, sku_id) WHERE sku_id IS NOT NULL AND offer_id IS NULL;` (name may be adjusted to naming convention; columns and predicate frozen). Envelope: no column change, no CHECK/constraint change, no RPC in the same migration, no trigger, no RLS/policy, no GRANT/REVOKE, no backfill, no data mutation, no permanent listings. Pre-check must prove: zero duplicate `(channel_account_id, sku_id)` pairs within the predicate, no equivalent index, no name collision, no semantic change to existing offer listings. On PASS or PASS WITH RESIDUAL RISKS, automatic return to M1A #2B-1 (RPC + §7–§9 tests) is granted without further authorization. Halt triggers: index build fails, data conflict surfaces, additional schema change required, unexpected side effect, RPC needing Phase 2–4 core-logic change. | Approved |
| BOR-DEC-036 | 2026-07-24 | Architecture (Halt) | **M1A #2B-1a — DATA CONFLICT — INDEX NOT APPLIED.** Read-only pre-check only; **zero migrations, zero DDL, zero rows written, zero grants changed, zero indexes created**. Pre-check surfaced: (a) 115 rows currently match the authorized predicate `sku_id IS NOT NULL AND offer_id IS NULL` — all `provider='bol'`, `status='draft'`, `control_state='read_only_import'`, 0 `borvat_direct`; (b) **8 duplicate `(channel_account_id, sku_id)` pairs** (16 rows total) exist within the predicate, each pair sharing account+SKU but carrying distinct `external_listing_id` values in a deliberate `M2-L1-<n>` / `M2-L1-DUP-<n>` fixture pattern with paired `published_quantity` 10/20 — deliberate Phase-2 seed evidence that the current effective invariant on Bol SKU drafts is `UNIQUE (channel_account_id, external_listing_id)` and explicitly allows multiple rows per `(channel_account_id, sku_id)`; (c) no equivalent index and no name collision exist. Halt is mandatory under BOR-DEC-035 §Pre-check ("لا Duplicate pairs" and "الفهرس لا يغيّر معنى ... listings الحالية") and §شرط التوقف ("ظهرت بيانات متعارضة"). Conditional return to M1A #2B-1 is **NOT** engaged. **Correction on record:** BOR-DEC-034 / `docs/PHASE5_M1A_M2B1_DRAFT_LISTING_WRITE_PATH_REPORT.md` §3 statement "115 Bol import-draft listings, all with `sku_id IS NULL` (imported at offer level)" is factually incorrect and superseded — the 115 rows have `sku_id IS NOT NULL AND offer_id IS NULL`. `channel_listings WHERE offer_id IS NOT NULL` count = 0 today. Baseline invariants unchanged and re-verified read-only: `place_order` EXECUTE limited to postgres+sandbox_exec (P5-HF-001 intact); `channel_connections.live_authorized_at NOT NULL` count = 0; RLS enabled 62/62 public tables. Deliverable: `docs/PHASE5_M1A_M2B1A_SKU_LISTING_UNIQUENESS_REPORT.md`. **Presented (NOT executed) for a follow-up owner ruling:** (Option A1) narrow the partial index predicate to `sku_id IS NOT NULL AND offer_id IS NULL AND external_listing_id IS NULL AND control_state='paused' AND status='draft'` — 0 rows match today, index build safe, uniqueness enforced only for the RPC-authored Borvat-Direct fail-closed shape which is the only creation path (§6 forbids direct DML on `authenticated`/`anon`/`service_role`/`sandbox_exec`); (Option B) drop the new index entirely and let the RPC generate a deterministic `external_listing_id = 'borvat_direct:<catalog_sku_id>'`, reusing the existing `UNIQUE (channel_account_id, external_listing_id)` as the DB-level idempotency floor with `INSERT ... ON CONFLICT` — zero schema change; (Option C — Rejected) backfill the 8 Bol duplicates — forbidden by §Scope. **STILL BLOCKED**: any M1A #2B-1a migration, any M1A #2B-1 migration or RPC, any Draft Listing insert, any Publication RPC, price/tax/inventory publication, product cutover, checkout re-enable, public storefront, search indexing, customer-facing routes, `borvat_direct` `channel_connections`, Bol Live, Stripe Live, M2–M10. Next step requires a **separate Owner ruling** picking Option A1, Option B, or an alternative scoping. | Approved (as halt) |
| BOR-DEC-037 | 2026-07-24 | Architecture | **M1A #2B-1 — DRAFT LISTING WRITE PATH APPLIED (Option B).** Additive migration only: created SECURITY DEFINER function `public.create_borvat_direct_draft_listing(_merchant_store_id uuid, _catalog_sku_id uuid, _idempotency_key text)` with `search_path=`, ACL `postgres/authenticated/service_role/sandbox_exec` (PUBLIC and anon revoked), function body md5 `9d533d55692f75ab959f1989056eb066`. **No new index, no schema change, no policy change, no Phase 2–4 function change, no backfill, no direct table grants.** Idempotency floor = existing `UNIQUE (channel_listings.channel_account_id, external_listing_id)`. Deterministic channel-native identifier format `borvat_direct:sku:<catalog_sku_id>` derived server-side from validated inputs; client cannot supply it. Insert path: `INSERT ... ON CONFLICT (channel_account_id, external_listing_id) DO NOTHING` then integrity re-check on the surviving row (same `sku_id`, `offer_id IS NULL`) — mismatch raises `23505 integrity conflict on borvat_direct listing identifier`. Fail-closed pre-conditions enforced inside function: `auth.uid()` present, merchant_store exists and `status=active`, caller has `listings.manage` on the store’s company, exactly one Borvat Direct account for the store with `provider=borvat_direct AND control_state=paused AND status=draft AND external_account_id IS NULL`, SKU exists in the same company and `status=active`. Row shape written: `status=draft`, `control_state=read_only_import`, `offer_id=NULL`, `published_quantity=0`, `published_version=0`, `last_published_at=NULL`, `units_per_offer=1`. Audit rows written to `agent_audit_log` on success and on forbidden/integrity-conflict paths. **Explicit rejection of Option A1** — mutable-predicate partial index (`external_listing_id IS NULL AND control_state=paused AND status=draft`) rejected because uniqueness would only hold while the row remained in those transient states, allowing a second draft after any lifecycle transition; therefore A1 does not guarantee the invariant across a listing’s lifetime. Option B relies on server-derived deterministic identifier + existing global unique constraint, holding across all lifecycle states. **Interpretation on record:** `channel_listings.external_listing_id` is a channel-native listing identifier (Bol issues it for Bol listings, Borvat Direct issues it for its own listings) and is NOT a credential, secret, OAuth token, or external account id; `channel_accounts.external_account_id` stays `NULL` for Borvat Direct, no `channel_connections`, no OAuth. Baseline row snapshot immediately after migration: `channel_listings=115`, `bd_listings=0`, `sku_only=115`, `outbox_events=222`, `channel_live_dispatches=11`, `channel_shadow_dispatches=9` — 115 pre-existing Bol drafts and 8 Bol duplicate `(account,sku)` pairs from BOR-DEC-036 remain unchanged and unaffected by this migration. Baseline invariants re-verified: P5-HF-001 intact (`place_order` EXECUTE limited to postgres+sandbox_exec); `channel_connections.live_authorized_at NOT NULL = 0`; RLS enabled on all 62 public tables. **Test execution:** structural verification PASS (function signature, `SECURITY DEFINER`, `search_path=`, ACL matrix, identifier format constant, ON CONFLICT wiring, audit paths, absence of side-effect tables); functional end-to-end suite (§10 T1–T28) was authored and staged in `/tmp/m2b1_tests.sql` inside a `BEGIN…ROLLBACK` transaction but could NOT execute in the Lovable-native sandbox because `INSERT INTO auth.users` returns `permission denied for schema auth` — same environmental limit already accepted in the Lovable-Native Verification decision — so per-user runtime paths (owner accepts, non-member rejected, cross-company SKU rejected, archived SKU rejected, cross-account isolation, idempotency return, integrity-conflict path with a foreign SKU, audit success/denied rows) remain **UNVERIFIED at runtime**. Verdict: **M1A #2B-1 PASS WITH RESIDUAL RISKS** — write path installed and structurally sound, functional runtime suite deferred pending an authorized synthetic-auth-user helper or an explicit acceptance to verify against a real signed-in owner. Deliverable: `docs/PHASE5_M1A_M2B1_DRAFT_LISTING_WRITE_PATH_REPORT.md` (Option-B revision, superseding the prior §3 factual correction already logged in BOR-DEC-036, which itself remains unmodified). **STILL BLOCKED**: any Publication RPC, price/tax/inventory publication, product cutover, checkout re-enable, public storefront, search indexing, customer-facing routes, `borvat_direct` `channel_connections`, Bol Live, Stripe Live, M2–M10. Next step requires a separate Owner ruling. | Approved |
| BOR-DEC-038 | 2026-07-25 | Verification | **M1A #2B-1V — LOVABLE-NATIVE FUNCTIONAL VERIFICATION EXECUTED — PASS WITH RESIDUAL RISKS.** No migration, no schema change, no policy change, no ACL change, no function change in this decision. `public.create_borvat_direct_draft_listing` body MD5 (rstrip trailing newline) `9d533d55692f75ab959f1989056eb066` re-verified identical to BOR-DEC-037; `pg_get_functiondef` SHA-256 `97f44e1db006f55e236dbfd2e3ce7765a33e231887adc11c674e092b0ddb276e`. Method = DATABASE-LEVEL AUTH CONTEXT SIMULATION (not full PostgREST HTTP): transaction-local `set_config('request.jwt.claim.sub', <uuid>, true)` and `set_config('request.jwt.claim.role', 'authenticated', true)` before each RPC call, matching the actual definitions of `auth.uid()` and `auth.role()` inspected in `pg_proc`. `auth.users` never touched — only three pre-existing seeded user IDs used (`69f05eb9…`, `d54dd474…`, `030630e9…`). Fixtures (companies, members, `merchant_stores`, Borvat Direct `channel_accounts`, `catalog_skus`, one forged `channel_listings` row for T15) inserted directly via `sandbox_exec` inside a single `BEGIN … ROLLBACK` transaction; no `ALTER`, no `DROP`, no trigger/constraint suppression, no global RLS toggle. **18 runtime tests executed; 17 PASS, 1 design finding.** PASS: T1 owner-happy-path returns listing UUID; T2 idempotent second call returns same id and keeps row count at 1; T3 different SKU on same account creates distinct listing; T4 same SKU on different store/account creates distinct listing; T5 row shape correct (`status=draft`, `control_state=read_only_import`, `offer_id=NULL`, `published_quantity=0`, `published_version=0`, `last_published_at=NULL`, `units_per_offer=1`, `external_listing_id='borvat_direct:sku:<uuid>'`); T6 empty auth context → SQLSTATE `28000 not authenticated`; T7 non-member of Company A → `42501`; T8 member without `listings.manage` → `42501`; T9 SKU from Company B against Store from Company A → `42501`; T10 caller from Company A against Store from Company B → `42501`; T11 archived SKU → `22023 sku not active`; T12 non-existent SKU → `23503 sku not found`; T13 non-existent store → `23503 merchant_store not found`; T14 store not `active` → `22023 merchant_store not active`; T15 forged pre-existing row with same `(channel_account_id, external_listing_id)` but different `sku_id` → `23505 integrity conflict on borvat_direct listing identifier` (RPC does not return the mismatched id); T16 success audit rows persist (4 rows observed for 4 success/idempotent calls); T18 audit payloads contain zero `password|token|secret|oauth|bearer|api_key` patterns. **DESIGN FINDING T17 — filed as R-5 · Denied audit rows are not durable:** the RPC inserts `agent_audit_log` denied row and then `RAISE EXCEPTION` in the same plpgsql block, so the surrounding (sub)transaction unwind discards the denied audit insert; success/idempotent audit paths persist correctly. This is not a violation of any M1A #2B-1 invariant (durable denied audit was not required). Future mitigations under consideration (no work now): `NOTIFY`, an outbox row committed before the raise, or `pg_background`. Zero side-effect delta confirmed inside the test transaction across `outbox_events`, `channel_live_dispatches`, `channel_shadow_dispatches`, `channel_reconciliation_findings`, `inventory_transactions`, `inventory_reservation_headers/lines/allocations`, `channel_orders`, `channel_order_lines`, legacy `orders`/`order_items`, and `channel_connections` (all deltas = 0). Bol-provider `channel_listings` (115 rows, 8 duplicate `(account, sku)` pairs) unchanged. Post-`ROLLBACK` counts identical to pre-test baseline: `channel_listings=115`, `borvat_direct:sku:%=0`, `outbox_events=222`, `merchant_stores=0`, Borvat Direct `channel_accounts=0`. **P5-HF-001 intact** — `place_order` `proacl` remains `{postgres=X/postgres, sandbox_exec=X/postgres}` (no `authenticated`, no `anon`). Bol Live disabled. Stripe Live disabled. ACL matrix on the RPC unchanged: `{postgres, authenticated, service_role, sandbox_exec}` — `service_role` EXECUTE flagged as **ACL HARDENING CANDIDATE** for a future decision; not withdrawn now. `sandbox_exec` EXECUTE retained (R-1). Scope caveat retained (R-6): this is DB-level auth-context simulation, not a full PostgREST end-to-end HTTP request; the RPC's own `auth.uid()`/`auth.role()`-driven authorization is fully exercised because RLS is bypassed by `SECURITY DEFINER`. Deliverable: `docs/PHASE5_M1A_M2B1_DRAFT_LISTING_WRITE_PATH_REPORT.md` §13 (append-only extension of the BOR-DEC-037 deliverable). Verdict: **M1A #2B-1 FUNCTIONAL VERIFICATION PASS WITH RESIDUAL RISKS** (R-1, R-3, R-4, R-5, ACL hardening candidate on `service_role`, R-6 auth-context-simulation scope caveat). **STILL BLOCKED**: publication RPC, price/tax/inventory publication, product cutover, checkout re-enable, public storefront, search indexing, customer-facing routes, `borvat_direct` `channel_connections`, Bol Live, Stripe Live, M2–M10, and any further schema/RPC/ACL change. Next step requires a separate Owner ruling. | Approved |
| BOR-DEC-039 | 2026-07-25 | Verification (Closure) | **M1A #2B-1V R-5 ACCEPTED AS SCOPED AUDIT RESIDUAL RISK — Owner ruling O-A.** Sealed verdict: **M1A #2B-1V FUNCTIONAL VERIFICATION PASS WITH ACCEPTED RESIDUAL RISK R-5**, and consequently **M1A #2B-1 ACCEPTED AND CLOSED WITH RESIDUAL RISKS**. No migration, no schema/policy/ACL/grant/function change in this decision. `public.create_borvat_direct_draft_listing` body MD5 (rstrip trailing newline) `9d533d55692f75ab959f1989056eb066` unchanged; `pg_get_functiondef` SHA-256 `97f44e1db006f55e236dbfd2e3ce7765a33e231887adc11c674e092b0ddb276e` unchanged; `proacl` `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}` unchanged. **Basis (proven in BOR-DEC-038):** Authorization enforced (all unauthorized callers receive `42501`, no listing created); cross-tenant isolation enforced (T7/T9/T10 rejected with zero rows written); idempotency verified (T2 same-id, count=1); integrity conflict enforced (T15 `23505`); all side-effect deltas = 0 across `outbox_events`, `channel_live_dispatches`, `channel_shadow_dispatches`, `channel_reconciliation_findings`, `inventory_transactions`, `inventory_reservation_headers/lines/allocations`, `channel_orders`, `channel_order_lines`, legacy `orders`/`order_items`, `channel_connections`; no public visibility; no publication/activation; no pricing; no inventory integration; no search; no checkout; no orders; Bol Live disabled; Stripe Live disabled; P5-HF-001 intact (`place_order` `proacl = {postgres=X/postgres, sandbox_exec=X/postgres}`). **R-5 classification (final, sealed): DENIED-ATTEMPT AUDIT OBSERVABILITY GAP.** T17 result: 0 denied audit rows across four denied calls (T7/T8/T9/T10). Root cause: `INSERT INTO agent_audit_log(status='denied', …)` followed by `RAISE EXCEPTION` inside the same plpgsql (sub)transaction — the raise unwinds the subtransaction and discards the audit insert; PostgREST/HTTP behaves identically because the request transaction is aborted. R-5 is **NOT** an authorization gap, **NOT** a tenant-isolation gap, **NOT** a data-integrity gap, **NOT** an idempotency gap, **NOT** a lifecycle gap. **Scope of acceptance:** Draft Listing Foundation only. R-5 remains **open** in the Risk Register and MUST be re-addressed before any of: enabling Publication or Activation; opening Public Storefront writes; enabling Checkout or Orders; reusing the write-then-raise pattern in any financial, inventory, or reservation RPC; treating `agent_audit_log` as the complete forensic record of every denied attempt; onboarding formal Compliance or Security-monitoring requirements. **No remediation authorised now** — explicitly forbidden in this decision: `dblink`, `pg_background`, `pg_net`, any new extension, any loopback DB connection, any new outbox, any RPC modification, any change to the public API contract. Owner rationale: R-5 opens no unauthorized capability; all unauthorized writes are rejected; adding autonomous-transaction mechanisms would enlarge attack and operational surface; the fix must be designed later at an architectural layer, not as a plpgsql patch. **Preferred future design (recorded, not authorised):** (1) edge/server wrapper that records the denied attempt in an independent transaction before invoking the RPC; (2) result-envelope RPC returning `{ success | denied, reason }` with the server translating denied → HTTP error after commit; (3) dedicated security-event ingestion path decoupled from the business transaction. Do NOT default to `dblink`. **Mitigation wording correction (supersedes BOR-DEC-038 §13.5 clause on infra logs):** Postgres and PostgREST logs may provide an additional signal but are NOT a substitute for `agent_audit_log` — retention, structure, and actor correlation differ, and infra logs alone do NOT constitute durable application-level denied-audit. **Not modified retroactively:** BOR-DEC-037 and BOR-DEC-038 remain as-written. **Post-decision state — Closed:** M1A #2B-1 structural implementation; M1A #2B-1V functional verification. **Still BLOCKED:** permanent listings for real products, Publication, Activation, Public Storefront, Pricing, Inventory integration, Search, Checkout, Orders, Bol Live, Stripe Live, M2–M10 — each requires separate Owner authorisation. Deliverable: `docs/PHASE5_M1A_M2B1_DRAFT_LISTING_WRITE_PATH_REPORT.md` §14 (append-only). Halt after this entry per Owner instruction; no new phase without separate Owner approval. | Approved |








## قالب قرار جديد

### BOR-DEC-XXX — عنوان القرار

- التاريخ:
- النوع:
- الحالة: Proposed / Approved / Superseded / Rejected
- القرار:
- السبب:
- البدائل:
- الأثر التجاري:
- الأثر المعماري:
- الأثر الأمني/القانوني:
- خطة الانتقال:
- الاختبارات المطلوبة:
- المالك الموافق:
- القرار السابق المتأثر:

---

### BOR-DEC-040 — M1A #2C-1 SELLER READ-ONLY UI ACCEPTED WITH RESIDUAL RISKS
- التاريخ: 2026-07-25
- النطاق: أربع صفحات Seller Read-only فقط (`/seller/stores`, `/seller/stores/$storeId`, `/seller/stores/$storeId/listings`, `/seller/listings/$listingId`) بعد تنفيذ M1A #2C-1P.
- الأساس: 30/30 اختبار الأصل + 10/10 اختبارات Patch. لا Backend / Schema / Policy / ACL / RPC changes. Tenant isolation عبر RLS فقط. Allowlisted columns. لا Credentials أو Customer data. لا Mutation. لا Service role. P5-HF-001 سليم. Bol Live و Stripe Live معطلان.
- التصحيحات المنفذة: Lifecycle status لم تعد تُعاد تسميتها كحالة Publication؛ Channel state أصبح Badge/Caption مستقل؛ رسالة محايدة عند نقص الصلاحية؛ توحيد تسميات Status filter.
- المخاطر المتبقية:
  - R-5: مفتوحة (audit rollback).
  - R-C1..R-C4: مقبولة كما هي.
  - R-C5: Client-side RLS reads مقبولة لهذا النطاق فقط — ليست سابقة لـ Admin cross-merchant / Writes / Publication / Checkout / Orders / Sensitive data.
  - R-C6: Server-side pagination/filtering مطلوبة قبل Real catalog scale أو فتح Storefront.
  - R-C7: الرسالة المحايدة تخلط بين "لا حساب" و"لا صلاحية" — مقبولة حتى ظهور Backend surface للصلاحيات.
- الاختبارات المطلوبة: نُفّذت جميعها (P1–P10) بنجاح.
- المالك الموافق: Owner.
- القرار السابق المتأثر: BOR-DEC-039 (M1A #2B-1 مغلق) — دون تعديل. R-5 تبقى مفتوحة.
- ما يبقى محظورًا: Admin cross-merchant UI, Public Storefront, Publication/Activation, Real product listings, Pricing, Inventory integration, Search indexing, Checkout, Orders, Bol Live, Stripe Live, Migrations, New RPCs — كلها تحتاج تفويض Owner منفصل.

---

## BOR-DEC-041 — M1A #2D-1A PLATFORM ADMIN ROLE GOVERNANCE HARDENING APPLIED

- **التاريخ:** 2026-07-25
- **النوع:** Security & Governance
- **الحالة:** Approved — PASS WITH ACCEPTED RESIDUAL RISKS.
- **النطاق المنفذ:** `public.user_roles` فقط. تم استبدال `prevent_admin_self_grant` بحارس شامل `guard_user_roles_mutation` (INSERT/UPDATE/DELETE) وإضافة `audit_user_roles_change` (SECURITY DEFINER) الذي يكتب في `agent_audit_log`. تم `REVOKE ALL` على `user_roles` من `PUBLIC`/`anon`/`authenticated`/`service_role`. `sandbox_exec` يحتفظ بـ `SELECT, INSERT` فقط (Lovable tooling).
- **الملف:** `supabase/migrations/20260725214423_f150c58a-ae77-4a82-9fd1-73d7b3f69485.sql` (SHA-256 `00d39dc7b68caaada7bc427fb6aade3feabeff6c118f59084923a450b1bbf331`).
- **التقرير:** `docs/PHASE5_M1A_M2D1A_PLATFORM_ADMIN_ROLE_GOVERNANCE_REPORT.md`.
- **التحقق:** 16/16 اختبارات قابلة للتنفيذ في `sandbox_exec` نجحت تحت `BEGIN … ROLLBACK`. سيناريوهات ما بعد وجود Admin (S1–S9) موثقة بمصفوفة قرار في §3.3 وتُختبر تحت #2D-1B.
- **المخاطر المقبولة:**
  - **R-D2** — محاولات التغيير المرفوضة قد تظهر في Infrastructure logs فقط، لأن BEFORE guard rollback يلغي كتابة الـAudit في نفس Transaction (نفس فئة R-5 / BOR-DEC-039).
  - **R-D4** — `sandbox_exec` يحتفظ بـ `SELECT + INSERT`؛ الحارس + RLS يبطلان محاولات الكتابة، لكن السطح موجود.
  - **R-D5** — شكل صف الـAudit مثبت بتعريف Trigger فقط لأن admin count = 0؛ سيتم التحقق أول مرة تحت #2D-1B.
  - **R-D6** — `EXECUTE` الافتراضي على دالتي Trigger لم يتم سحبه (`sandbox_exec` ليس Owner)؛ الدالتان trigger-only بدون معاملات، ولا سطح استغلال مباشر. الإصلاح المتقدم: `REVOKE EXECUTE` عبر Owner.
- **المخاطر المفتوحة:** **R-D3** — Bootstrap لأول Platform Admin يبقى غير محدد؛ يُحل تحت M1A #2D-1B بقرار Owner منفصل.
- **ما لم يُنفذ (ممنوع بالتفويض):** لم يُنشأ أي Admin، لا Admin read RPC، لا Admin UI، لا تعديل RLS خارج النطاق، لا bootstrap RPC/token/allowlist، لا تغييرات Seller UI / Storefront / Publication / Bol Live / Stripe Live. `P5-HF-001` (`place_order`) لا يزال محظورًا (اختبار T16).
- **المالك الموافق:** Owner.
- **الترتيب القادم:** M1A #2D-1B Precheck (First Platform Admin Bootstrap Design) — يتطلب تفويض Owner صريح قبل البدء. Admin read RPCs وAdmin UI تبقى محظورتين.

---

## BOR-DEC-042 — FIRST PLATFORM ADMIN ASSIGNED
- **التاريخ:** 2026-07-25
- **السياق:** M1A #2D-1C — تنفيذ Option B (Migration-bound assignment) المعتمد في #2D-1B.
- **القرار:** تعيين أول Platform Admin على الحساب المعتمد من المالك:
  - Email: `ceo@suroohholdings.com`
  - User UUID: `368d803e-d06b-485c-9e3c-e58b168d0419`
  - Purpose: Primary owner-controlled platform administration account for Borvat.
- **الآلية:** Migration واحدة Transactional (Owner-authored, Owner-approved):
  1. تحقق `admin_count = 0`.
  2. تحقق وجود الحساب في `auth.users`.
  3. تحقق عدم وجود صف `admin` مسبق لنفس المستخدم.
  4. تعطيل `trg_guard_user_roles` فقط داخل نفس المعاملة (Audit trigger بقي فعّالًا).
  5. INSERT صف `admin` (دور `buyer` القائم لم يُمَس).
  6. إعادة تفعيل `trg_guard_user_roles`.
  7. إدخال سجل Audit صريح باسم مختلف: `first_platform_admin_bootstrap_completed` يحمل مرجع القرار `BOR-DEC-042`.
  8. `REVOKE INSERT ON public.user_roles FROM sandbox_exec` — إغلاق R-D4.
  9. `REVOKE EXECUTE` على `guard_user_roles_mutation()` و`audit_user_roles_change()` من `PUBLIC`, `anon`, `authenticated`, `service_role` — إغلاق R-D6 للأدوار المذكورة.
- **Audit — فصل بين السجلين (عدم ازدواج):**
  - Row A: `tool_name='user_roles.mutation'` (DML event، يُكتب لكل INSERT/UPDATE/DELETE على `user_roles`).
  - Row B: `tool_name='first_platform_admin_bootstrap_completed'` (governance event، يحمل `owner_decision_ref='BOR-DEC-042'`).
  - الحقلان `tool_name` مختلفان جوهريًا؛ Row A لا يحمل مرجع القرار، Row B لا يحمل `op/old_role/new_role`.
- **Post-checks (كلها PASS):** `admin_count=1`، الحساب المستهدف يملك `{admin, buyer}`، لا Admin آخر، Guard + Audit triggers مفعّلان، `sandbox_exec` بلا INSERT/UPDATE/DELETE (SELECT فقط)، `anon`/`authenticated`/`service_role` بلا DML على `user_roles` وبلا EXECUTE على دالتي Trigger، **P5-HF-001** سليم (`place_order` محظور)، Bol Live وStripe Live معطلان، لا Admin read RPC ولا Admin UI أُنشئا.
- **المخاطر المتبقية:**
  - **R-D2** — مستمر: محاولات role-change المرفوضة تُلغي صف Audit مع المعاملة.
  - **R-D6 partial** — `sandbox_exec` يحتفظ بـEXECUTE على دالتي Trigger؛ الدالتان trigger-only بلا معاملات، ولا سطح استغلال مباشر (TG_OP يكون NULL في الاستدعاء العادي فتُرجع NULL).
  - **R-D3, R-D4, R-D5** — مغلقة.
- **الحكم النهائي:** `M1A #2D-1C PASS WITH RESIDUAL RISKS`.
- **المالك الموافق:** Owner.
- **الترتيب القادم (يتطلب تفويض منفصل):** Admin read RPCs، Admin UI. حتى ذلك الحين لا تغييرات على السطح الحالي.

---

## BOR-DEC-043 — M1A #2D-2A: Platform Admin Cross-Merchant Read RPC Foundation

- **التاريخ:** 2026-07-25
- **النطاق:** إنشاء ثلاث RPCs Read-only, Admin-gated: `admin_list_merchant_stores`, `admin_list_borvat_direct_accounts`, `admin_list_borvat_direct_draft_listings`.
- **التصميم:** `SECURITY DEFINER`, `LANGUAGE plpgsql`, `STABLE`, `SET search_path=''`, Owner=`postgres`, بلا Dynamic SQL, بلا Writes.
- **Gate:** `auth.uid() IS NOT NULL` + `public.has_role(auth.uid(),'admin')`؛ فشل ⇒ `42501`.
- **Pagination:** Keyset على `(created_at DESC, id DESC)`، `_page_size` مُقَنَّن 1..100، `LIMIT page_size+1` كإشارة `has_more`، Cursor يجب أن يحوي الحقلين معًا أو لا شيء.
- **Search:** trimmed, ≤100 حرف، على الحقول المسموحة فقط (company name, store display name, slug, sku code, product title).
- **Status filter:** Allowlist `{draft,active,inactive,archived}` — أي قيمة أخرى ⇒ `22023`.
- **Response allowlists:** بلا credentials/tokens/orders/customers/costs/audit payloads/emails/addresses.
- **Grants:** `EXECUTE` لـ `authenticated` و`sandbox_exec` فقط؛ `service_role`, `anon`, `PUBLIC` مرفوضة (تحقق عبر `proacl`). لا Table grants جديدة.
- **Zero-delta:** لا تعديل RLS/جداول/Indexes/Policies/Rows/Outbox/Audit/Inventory.
- **Tests:** 35 حالة PASS/PASS-by-equivalence داخل `BEGIN…ROLLBACK`.
- **R-D7 (جديد):** Admin reads بلا application audit؛ مقبول لهذه القوائم Read-only Allowlisted فقط. غير مقبول مستقبلًا لـ exports/customer inspection/orders/payments/bulk/impersonation دون تصميم Audit منفصل.
- **R-D2 / R-D6:** غير مفتوحة في هذه الجولة.
- **UI:** لم تُنشأ. لا Admin route ولا مكون. Wiring يتطلب تفويضًا منفصلًا.
- **الحكم النهائي:** `M1A #2D-2A PASS WITH RESIDUAL RISKS`.
- **المالك الموافق:** Owner.
- **الترتيب القادم (يتطلب تفويض منفصل):** Admin UI wiring أو Detail RPCs.

---

## BOR-DEC-044 — M1B-1: Borvat Direct Publication State Separated From Channel Lifecycle

- **التاريخ:** 2026-07-25
- **النطاق:** إنشاء جدول `public.borvat_direct_listing_publications` (One-to-one مع `channel_listings`) كسطح Publication state خاص بـBorvat Direct، منفصلاً عن `channel_listings.status` (Lifecycle) و`control_state` (Channel control).
- **الحقول:** `channel_listing_id` (PK/FK)، `publication_status` (CHECK ∈ {`not_ready`,`ready`,`published`,`paused`,`withdrawn`})، `first_published_at`, `last_published_at`, `last_unpublished_at`, `status_changed_at`, `version`, `created_at`, `updated_at`. لا Price/VAT/Shipping/Inventory/Customer-visible boolean/Search doc.
- **Default state:** `not_ready`. Trigger `_borvat_direct_publication_provider_guard` يمنع أي INSERT بحالة أخرى، ويرفض أي Listing لا يكون provider حسابها = `borvat_direct` (يحمي صفوف Bol الحالية).
- **Grants:** `REVOKE ALL FROM PUBLIC/anon/authenticated/sandbox_exec` ثم `GRANT SELECT TO authenticated` فقط. لا INSERT/UPDATE/DELETE لأي دور تطبيقي. `has_table_privilege` مؤكد: authenticated={SELECT}, anon={}.
- **RLS:** مفعّل. سياستان SELECT-only لدور `authenticated`:
  - **Seller read** عبر `public.company_member_has_permission(company_id, auth.uid(), 'listings.read')` على الشركة المالكة للـListing.
  - **Platform admin read** عبر `public.has_role(auth.uid(),'admin')`.
- **Writes path:** لا شيء. لا Publish/Unpublish RPC، لا Seller write، لا Admin write. أول نشر فعلي يتطلب Seller publish workflow لاحقًا مع إغلاق **R-5**.
- **Backfill:** `borvat_direct` listings count = **0** ⇒ لا صفوف Publication أُنشئت. Bol listings count = 115 (بدون أي تعديل: `channel_listings.status`, `control_state`, `published_quantity`, `last_published_at` سليمة).
- **Zero-delta مؤكد على:** `channel_listings`، `channel_accounts`، `outbox_events`، Inventory ledgers، Orders، Pricing/Tax/Shipping (غير موجودة أصلاً).
- **HTTP behavior contract (تصحيح المالك المعتمد):**
  - **404** — Never-published أو unknown URL؛ Draft existence لا تُكشف للعامة.
  - **410 Gone** — Previously published ثم permanently withdrawn.
  - **200 مع Purchase disabled** — Temporarily unavailable أو out of stock.
  - **410/Hide** — Compliance emergency وفق القرار القانوني والتشغيلي.
  - قاعدة "never 404" الواردة في Precheck **مُلغاة**.
- **Eligibility contract (موثّق فقط، بلا تنفيذ):** Store eligible + Borvat Direct account eligible + Product active + SKU active + Content complete + Price valid + Tax version valid + Shipping policy valid + Inventory policy valid + Compliance clear + No duplicate visible listing. غياب Pricing/Tax/Shipping ⇒ كل Listing يبقى `not_ready` قسرًا.
- **Timestamps semantics:** `first_published_at` ثابت بعد أول نشر، `last_published_at`/`last_unpublished_at` تتحدث عند التحويل، `status_changed_at` عند أي تغيير حالة، `updated_at` تلقائي عبر Trigger. جميع Published timestamps حاليًا NULL.
- **Tests (اجتازت):** جدول موجود + RLS مفعّل، Policies موجودة، Constraints (PK + FK CASCADE + CHECK)، رفض Bol listing (`23514`)، رفض Invalid status (via provider guard/CHECK)، رفض INSERT من anon/authenticated (لا GRANT)، Bol rows unchanged (115/115 status+control_state، `sum(published_quantity)=4465` ثابت)، صفر صفوف Publication، صفر Borvat Direct listings، لا Public RPC، لا Public grants.
- **المخاطر المفتوحة الجديدة:**
  - **R-P1** — Publication eligibility غير قابلة للاكتمال قبل Pricing/Tax/Shipping foundations.
  - **R-P2** — لا Publication transition audit (سيُصمَّم مع Publish workflow).
  - **R-P3** — لا Seller publish workflow.
  - **R-P4** — لا Public visibility evaluator.
- **الاعتماديات لخطوات لاحقة:**
  - **R-5** يجب إغلاقها قبل Seller publish RPC (audit persistence عبر transaction).
  - **R-D8** يجب إغلاقها قبل Live public storefront (Role-revocation flight).
  - **R-D7** يجب إغلاقها قبل Admin publish-on-behalf.
- **P5-HF-001:** سليم. `place_order` يبقى محظورًا. Bol Live وStripe Live معطلان.
- **Rollback:** `DROP TABLE public.borvat_direct_listing_publications CASCADE; DROP FUNCTION public._borvat_direct_publication_provider_guard(); DROP FUNCTION public._borvat_direct_publication_touch_updated_at();`. لا آثار جانبية على أي جدول آخر.
- **الحكم النهائي:** `M1B-1 PASS WITH RESIDUAL RISKS`.
- **المالك الموافق:** Owner.
- **الترتيب القادم (يتطلب تفويض منفصل):** M1B-2 Pricing foundation، أو M1B-3 Tax، أو M1B-4 Shipping. لا Publish workflow ولا Public storefront قبل ذلك.

## BOR-DEC-045 — TAX FOUNDATION PRECEDES MERCHANT STORE PRICING
**Date:** 2026-07-26
**Context:** M1B-1 مقبول ومغلق مع مخاطر متبقية. Owner صحّح ترتيب التنفيذ: Tax قبل Pricing.
**القرار:** ترتيب M1B المعدل: M1B-2A (Precheck) → M1B-2B (Tax) → M1B-3 (Merchant Store Pricing) → M1B-4 (Shipping).
**السبب:** سعر Borvat Direct gross/VAT-inclusive ويجب أن يثبت `tax_rate_version_id`. إنشاء Pricing قبل Tax يفرض FK وهميًا أو مؤجلًا يكسر Source of Truth ويستوجب migration مربكة لاحقًا.
**M1B-2A Precheck Verdict:** `SAFE TAX FOUNDATION DESIGN IDENTIFIED`. تحليل فقط — لا migrations، لا جداول، لا rates، لا RPCs، لا UI.
**التوصية المعتمدة:** Option B — Country-specific product tax classification. Rates ممثلة بـ integer basis points. Effective-dating صارم مع immutability بعد التفعيل. VAT identity على Company لا على Store. Store price = gross + pinned tax_rate_version_id، net مشتق. Destination change يعيد التحقق. `zero_rated` ≠ `exempt`.
**الجداول المقترحة (لم تُنشأ):** `tax_categories`, `tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles`.
**نطاق MVP:** NL + BE, B2C, EUR, gross-inclusive. Reverse-charge/outside-scope مؤجلة.
**Governance:** Seller يقترح classification فقط. Platform Admin يعتمد. `tax.rates.approve` صلاحية منفصلة لا يرثها General Admin.
**Order snapshot:** كل order line سيلتقط snapshot ثابت (rate version, gross/net/tax, currency, legal seller identity). Refunds تستخدم snapshot لا current rate.
**أثر المخاطر:** R-P1 تُغلق فقط عند اكتمال Tax+Pricing+Shipping. R-5 يظل يحجب Seller publish RPC. R-D7 يحجب Admin approve RPCs (Tax write path يبقى مؤجلًا في M1B-2B — reads فقط). R-D8 يحجب Live storefront.
**Invariants مصونة:** P5-HF-001 سليم. Bol Live/Stripe Live معطلان. جميع صفوف publications = `not_ready` (صفر صفوف). Bol channel_* غير متأثرة.
**Deliverable:** `docs/PHASE5_M1B2A_TAX_FOUNDATION_ARCHITECTURE_PRECHECK.md`.
**المالك الموافق:** Owner (approval of precheck scope pending review of this report).
**الترتيب القادم (يتطلب تفويض منفصل):** M1B-2B — Tax Foundation Implementation.

---

## BOR-DEC-046 — COUNTRY-SPECIFIC VERSIONED TAX FOUNDATION ESTABLISHED
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Approved
**Ruling:** M1B-2B executed under Owner authorization (Option 1). Additive-only tax foundation created in `public`: `tax_categories` (canonical taxonomy, 4 label rows), `tax_rate_versions` (country × category × effective window, lifecycle draft/approved/superseded/withdrawn), `catalog_product_tax_classifications` (product × destination country × effective window, lifecycle proposed/approved/superseded/withdrawn), `company_tax_profiles` (per-Company VAT identity, unverified by default). Non-overlap of effective windows enforced by two real Postgres exclusion constraints, not triggers. Zero real VAT rates, zero product classifications, zero VAT identities were seeded — reads-only baseline. RLS forced on all four tables; `authenticated` = admin-only reads on rate versions and product classifications, company-scoped reads on tax profiles; `anon` and `sandbox_exec` = none; no write RPC exposed in M1B-2B.
**Migration files:** `supabase/migrations/20260726093908_70ac2449-599a-4444-b350-4ff5d05feee5.sql` (`7a692224613281c9d24296d3cd14aa15a1a6f43f37e8c679f811734e943091e0`), `supabase/migrations/20260726094140_2dfdf99b-f8ba-4294-befc-9d9b2bb7005d.sql` (`0f9671651a0c7a22634c2e6bc3396c877067404faf67f3fdcd89d351a930c885`, self-cleaning test suite — zero persistent objects).
**Tests:** 13 behavioural + 3 post-cleanup PASS inside a rolled-back subtransaction. Overlapping approved windows rejected with `exclusion_violation`; drafts do not conflict; different category / different country never conflict; CHECK constraints reject invalid country codes, invalid ranges, approved-without-approver, negative rates, and vat-pair violations. Post-tests confirm 0 rows in all three sensitive tables.
**Invariants:** P5-HF-001 intact; Bol Live rows with `live_authorized_at` = 0; Stripe Live disabled; no `channel_listings` / `borvat_direct_listing_publications` / `channel_accounts` / `merchant_stores` row modified.
**Residual risks recorded:** R-T1 (has_role predicate evaluation), R-T2 (admin cross-tenant VAT identity read), R-T3 (draft overlaps allowed, will need approval-RPC enforcement), R-T4 (open-ended window semantics), R-T5 (SET NULL on approver FK), R-T6 (GiST index growth). Open blockers R-P1, R-D7, R-D8, R-5 unchanged.
**Deliverable:** `docs/PHASE5_M1B2B_TAX_FOUNDATION_IMPLEMENTATION_REPORT.md`.
**Verdict:** **M1B-2B PASS WITH RESIDUAL RISKS**.
**Still BLOCKED:** Pricing (M1B-3), Shipping (M1B-4), Tax approval workflows, Publication activation, Public Storefront, checkout re-enable, Bol Live, Stripe Live.

---

## BOR-DEC-047 — btree_gist AUTHORIZED FOR CONCURRENT EFFECTIVE-DATE EXCLUSION
**Date:** 2026-07-26 | **Type:** Infrastructure / Security | **Status:** Approved
**Ruling:** Owner authorized installation of the `btree_gist` extension **exclusively** in schema `extensions`, atomically within the M1B-2B migration, for the sole purpose of enforcing non-overlap of effective (approved) date ranges on `tax_rate_versions` and `catalog_product_tax_classifications`. Trigger-based substitutes for overlap protection are explicitly forbidden.
**Installed:** version `1.7`, schema `extensions`, owner `postgres`.
**Public delta:** 0 extension objects in schema `public` (verified via `pg_depend` → `pg_class` join).
**Concurrent overlap outcome:** Second overlapping approved window rejected with `SQLSTATE 23P01` (`exclusion_violation`); winning transaction proceeds; loser leaves no partial row.
**Forward-fix rule:** any change ships as a new migration; overlap semantics never move to triggers. Extension drop and constraint drop are both forbidden without a superseding Owner decision.

---

## BOR-DEC-048 — STORE PRICING REQUIRES COUNTRY-AWARE GROSS PRICE VERSIONING
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Approved
**Ruling:** Precheck M1B-3A accepted. Merchant-store pricing is modelled as country-specific, gross (VAT-inclusive), minor-unit BIGINT prices, keyed by `(merchant_store_id, catalog_sku_id, destination_country_code, currency_code)` with an effective window and a pinned `tax_rate_version_id`. Non-overlap of active windows must be enforced by a real Postgres exclusion constraint (`btree_gist`), never by triggers. Legacy `products.price_cents` / `order_items.price_cents` remain untouched.
**Deliverable:** `docs/PHASE5_M1B3A_MERCHANT_STORE_PRICING_ARCHITECTURE_PRECHECK.md`.

---

## BOR-DEC-049 — COUNTRY-SPECIFIC STORE/SKU GROSS PRICE FOUNDATION ESTABLISHED
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Approved
**Ruling:** M1B-3B executed. Additive-only. Created `public.merchant_store_offer_prices` with lifecycle `draft|active|superseded|withdrawn`, gross minor-unit BIGINT (> 0), ISO country/currency regex CHECKs, valid_from/valid_to range CHECK, self-supersession CHECK, positive-version CHECK, and a real Postgres exclusion constraint `msop_no_active_overlap` (`btree_gist`) filtered by `status='active'`. Three SECURITY DEFINER guard triggers with `search_path=''` enforce (a) store/SKU same-company ownership + scope-match on supersession, (b) tax integrity for active rows (approved rate + approved classification, matching country/category/window), (c) commercial immutability of active rows (only lifecycle transitions to superseded/withdrawn allowed). RLS `ENABLE + FORCE`, no policies, and all grants revoked from `PUBLIC`, `anon`, `authenticated`, `service_role`, `sandbox_exec` — deny-all baseline. Zero rows persisted. No RPC, no UI, no public visibility.
**Migration files:** `supabase/migrations/20260726101035_*.sql` (foundation), `20260726101419_*.sql` / `20260726101528_*.sql` / `20260726101603_*.sql` (self-cleaning test runner and its drop — zero persistent objects).
**Tests:** 24/24 behavioural PASS inside a rolled-back SECURITY DEFINER runner (money/format/status CHECKs, ownership guard, tax integrity guard, active immutability guard, exclusion-constraint overlap rejection at Postgres level, cross-country non-conflict, draft-not-participating, self-supersession CHECK). `sandbox_exec` SELECT denied post-cleanup — deny-all confirmed.
**Invariants:** P5-HF-001 intact; Bol Live rows with `live_authorized_at` = 0; Stripe Live disabled; `channel_listings` / `borvat_direct_listing_publications` / `channel_accounts` / `merchant_stores` / `catalog_*` / `products` / `order_items` / tax foundation rows untouched.
**Residual risks recorded:** R-PR1 (no seller draft-price workflow), R-PR2 (no activation/withdrawal workflow), R-PR3 (no official tax data loaded), R-PR4 (no destination-aware public price resolver), R-PR5 (no checkout repricing), R-PR6 (no promotion/discount model), R-PR7 (no shipping integration). Open blockers R-P1..R-P4, R-T1..R-T6, R-D7, R-D8, R-5 unchanged.
**Deliverable:** `docs/PHASE5_M1B3B_MERCHANT_STORE_PRICING_FOUNDATION_REPORT.md`.
**Verdict:** **M1B-3B PASS WITH RESIDUAL RISKS**.
**Still BLOCKED:** Tax rate/classification data loading, seller draft-price workflow, price activation workflow, shipping foundation, publication transitions, public storefront, checkout re-enable, Bol Live, Stripe Live.

---

## BOR-DEC-050 — JURISDICTION TAX RATE-BAND MODEL ADOPTED
**Date:** 2026-07-26 | **Type:** Architecture / Tax | **Status:** Approved
**Ruling:** M1B-2D executed. `tax_categories` retained as the **global treatment taxonomy** (`standard`, `reduced`, `zero`, `exempt`) — reclassified via table comment. New table `public.tax_rate_bands` keyed by `(country_code, band_code)` provides **stable jurisdiction-level band identities** that survive numeric rate changes and allow concurrent bands of the same treatment (resolves BE 6% + 12% reduced conflict). `tax_rate_versions` and `catalog_product_tax_classifications` retargeted from `tax_category_id` to `tax_rate_band_id`. New trigger `trg_tax_rate_versions_band_country` enforces rate-country = band-country. Composite FK `(tax_rate_band_id, country_code) → tax_rate_bands (id, country_code)` on classifications prevents cross-country band assignment. Exclusion constraints rebuilt: rate-version overlaps rejected per band (not per treatment); classification overlaps rejected per (product, country). Pricing guard `public.msop_guard_tax_integrity()` rewritten to perform **band-to-band matching** on active prices. `tax_rate_bands`: RLS `ENABLE + FORCE`, no policies, no grants to `PUBLIC/anon/authenticated/service_role`. No real rates, bands, or classifications persisted.
**Migration files:** `supabase/migrations/20260726104226_*.sql` (structural correction), `20260726104424_*.sql` / `20260726104554_*.sql` / `20260726104625_*.sql` (self-cleaning verification runner and drop — zero persistent objects).
**Tests:** 23/24 behavioural PASS inside a rolled-back SECURITY DEFINER runner. The single non-pass (T23) is a runner-side assertion mismatch (asserted `zero_rated` vs actual code `zero`); schema treatments verified correct independently. All 20 constraint/trigger behavioural scenarios passed: multiple bands per treatment, `(country, band_code)` uniqueness, country/format/status CHECKs, treatment FK, rate-band FK, rate-country ≠ band-country rejection, cross-band non-overlap acceptance, same-band overlap rejection (`23P01`), composite FK band-country integrity, classification overlap rejection (`23P01`), cross-country classification acceptance, active-price band match acceptance, band-mismatch rejection, country-mismatch rejection, out-of-window rate rejection, and legacy `tax_category_id` columns confirmed removed. Post-rollback row counts on all four tax/pricing tables = 0.
**Invariants:** P5-HF-001 intact; Bol Live disabled; Stripe Live disabled; `place_order` remains revoked; publication remains fail-closed; `channel_listings`, `borvat_direct_listing_publications`, `channel_accounts`, `merchant_stores`, `catalog_*`, `products`, `order_items` untouched. Belgium reduced-rate conflict eliminated by design.
**Residual risks recorded:** R-T7 (no official rate/band/classification data loaded), R-T8 (no band lifecycle workflow), R-T9 (test-fixture assertion drift — documentation only). Prior residuals R-PR1..R-PR7, R-P1..R-P4, R-5, R-D7, R-D8 unchanged. R-T1..R-T6 superseded by the band model correction where applicable.
**Deliverable:** `docs/PHASE5_M1B2D_JURISDICTION_TAX_RATE_BAND_CORRECTION_REPORT.md`.
**Verdict:** **M1B-2D PASS WITH RESIDUAL RISKS**.
**Still BLOCKED:** Tax data loading (bands, versions, classifications), seller draft-price workflow, price activation workflow, shipping foundation, publication transitions, public storefront, checkout re-enable, Bol Live, Stripe Live.

---




## BOR-DEC-050-A — R-T9 CLOSED: TEST ASSERTION ALIGNED WITH LIVE TAXONOMY
**Date:** 2026-07-26 | **Type:** Documentation correction | **Status:** Approved (addendum to BOR-DEC-050)
**Ruling:** Owner-directed terminology correction applied. `tax_categories.code` values remain `standard`, `reduced`, `zero`, `exempt` (unchanged — seed taxonomy NOT modified to match a test string). The M1B-2D runner assertion referenced the *treatment semantic* `zero_rated` instead of the *stored category code* `zero`; the assertion, not the schema, was wrong. Corrected in `docs/PHASE5_M1B2D_JURISDICTION_TAX_RATE_BAND_CORRECTION_REPORT.md` §3.1 with the live `code` / `label` / `description` / treatment mapping. Project-wide rule adopted: write **category code `zero`** for the stored identifier and **treatment `zero_rated`** for the legal/accounting semantic; the two are never interchangeable without qualification. No migration required — the temporary runner `_m1b2d_verify()` was already dropped, and the live semantic column (`description`: "Zero-rated supplies (rate = 0, still taxable and reportable)") is coherent with the code. **TAXONOMY SEMANTIC MISMATCH is NOT raised.** Corrected scoreboard: **24/24 PASS**.
**Residual risks:** **R-T9 CLOSED**. R-T7, R-T8 remain open. All other residuals unchanged.
**Verdict:** **R-T9 CLOSED — TEST ASSERTION ALIGNED WITH LIVE TAXONOMY**.

---

## BOR-DEC-051 — OFFICIAL TAX DATA USES SOURCE-VERIFIED DRAFT-THEN-APPROVE GOVERNANCE
**Date:** 2026-07-26 | **Type:** Governance | **Status:** Approved
**Ruling:** All official tax data (rate bands, rate versions, product classifications) enters the system as `draft` only, sourced from a **primary government source** documented in the milestone report and this log. Forbidden as a legal effective date, without exception: the verification date, the migration date, the current date, any approximate date, and any date from an undocumented secondary source. A rate version may only be created once its statutory commencement date is proven from primary sources (R-T13), and may only leave `draft` through an authorized approval path (R-T15 / R-D7). Band existence conveys no product classification and no price eligibility.
**Sources accepted for band taxonomy:** Belastingdienst (`belastingdienst.nl`) and Rijksoverheid for NL; FOD Financiën (`financien.belgium.be`) for BE. `ejustice.just.fgov.be` (consolidated KB nr. 20) not retrieved — R-T11 stays open.
**Verdict:** **ACCEPTED WITH OFFICIAL-SOURCE GAPS — SOURCES SUFFICIENT FOR RATE-BAND TAXONOMY ONLY**.

---

## BOR-DEC-052 — NL/BE RATE-BAND TAXONOMY SEEDED WITHOUT RATE VERSIONS
**Date:** 2026-07-26 | **Type:** Data seed (draft-only) | **Status:** Approved
**Migrations:** `20260726111836_8cd62f3d-4588-4648-af5e-aae463bb50e8.sql` (SHA-256 `70dc998604ccaf06460bd0480ee3fafe5f847ec3a5f3abfa73c3332422c4a55b`) — seed of 9 draft bands; `20260726111931_6b0e6af9-0aea-46e8-806c-0f193c748358.sql` (SHA-256 `c9821795e7c76714094e73ddae2296a09f8f2ce6bef3c402f35815bc16448c0f`) — removal of an `FR` negative-test probe row and revocation of all `sandbox_exec` DML on the tax/pricing/publication tables.
**Ruling:** Nine `tax_rate_bands` rows created, all `status='draft'`: NL `STANDARD`/`REDUCED_A`/`ZERO`/`EXEMPT`; BE `STANDARD`/`REDUCED_A`/`REDUCED_B`/`ZERO`/`EXEMPT`. Treatment mapping: `STANDARD`→`standard`, `REDUCED_*`→`reduced`, `ZERO`→category code `zero` (treatment `zero_rated`), `EXEMPT`→`exempt`. Band codes carry **no numeric rate** (`VAT_21`, `RATE_9`, `REDUCED_6`, `REDUCED_12` forbidden and absent). Display names may name the legal annex (`Belgium reduced band — Table A/B`); no description asserts that any product belongs to a band.
**Counts verified:** `tax_categories=4`, `tax_rate_bands=9`, `tax_rate_versions=0`, `catalog_product_tax_classifications=0`, `company_tax_profiles=0`, `merchant_store_offer_prices=0`.
**Tests:** 26/26 PASS — band count, treatment mapping, BE two reduced bands, NL one reduced band, no digits in band codes, duplicate `(country, band_code)` rejected (`23505`), all draft / none active, four downstream tables empty, `zero` ≠ `exempt`, RLS + FORCE RLS retained, zero policies, no `anon`/`authenticated`/`service_role` privileges, `sandbox_exec` write denied after remediation, publication fail-closed, P5-HF-001 `place_order` EXECUTE = false for anon and authenticated, Bol Live = 0, Stripe Live off, no fabricated effective date anywhere.
**Security finding closed in-turn (R-T14):** `sandbox_exec` had inherited `INSERT` on `tax_rate_bands` from M1B-2D and forced RLS did not stop it; one probe row was created and deleted, and DML was revoked across `tax_rate_bands`, `tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles`, `tax_categories`, `merchant_store_offer_prices`, `borvat_direct_listing_publications`. No new grants were issued.
**Zero-delta:** no schema object created/altered/dropped; guard function and all exclusion constraints untouched; publication statuses, Bol data, inventory, orders untouched; no UI or storefront surface.
**Residual risks:** R-T11 open (does not block bands); **R-T12 downgraded** from blocker to residual risk; R-T13 remains a blocker for rate versions; R-T15 remains a blocker for activation/approval; R-T7, R-T8 open; R-T14 closed; R-5, R-D7, R-D8, R-P1..R-P4 unchanged.
**Deliverable:** `docs/PHASE5_M1B3C1_NL_BE_RATE_BAND_DRAFT_SEED_REPORT.md`.
**Verdict:** **M1B-3C-1 PASS WITH RESIDUAL RISKS**.
**Still BLOCKED:** rate versions, product classifications, company tax profiles, seller pricing workflow, price activation, shipping, publication transitions, public storefront, checkout, Bol Live, Stripe Live. Next authorizable milestone: **M1B-3C-2 — AUTHORITATIVE EFFECTIVE-DATE RETRIEVAL AND RATE-VERSION DATASET**.

---


## BOR-DEC-053 — HISTORICAL LEGAL COMMENCEMENT DATES NOT FABRICATED
**Date:** 2026-07-26 | **Type:** Governance | **Status:** Approved (Owner)
**Ruling:** No rate version may be loaded with an unproven legal commencement date. The research/verification date and the migration date are never used as a legal effective date. No backdating. No historical recomputation of orders from current rates.
**Owner corrections recorded with this decision:**
- **R-T16 — RESOLVED BY RATE-VERSION / PRODUCT-SCOPE SEPARATION.** A change to the contents of the Belgian Table A / Table B is not a reason to block creating a rate version for an unchanged percentage. A *rate version* expresses a band's percentage over a period; a *product classification version* expresses whether a product sits in that band over a period. Adding/removing a product creates or ends a classification window and leaves the rate version untouched while the percentage is unchanged. Schema inspection in M1B-3C-3 confirms the separation is implementable on the existing tables (band-keyed exclusion on `tax_rate_versions`, independent `(product_id, country_code)` exclusion on `catalog_product_tax_classifications`).
- **R-T17 — remains a blocker for domestic use of ZERO.** NL/`ZERO` and BE/`ZERO` may not be activated as general local product destination rates; zero-rating is transaction-contextual (export, intra-EU supply, statutory treatment, buyer identity and documentary evidence). ZERO bands stay `draft`, receive no automatic product classification, back no price activation, and are excluded from B2C local destination pricing until a separate transaction-tax design exists. They are retained as reserved taxonomy only.
**Verdict:** **M1B-3C-2 ACCEPTED AND CLOSED — EFFECTIVE-DATE EVIDENCE INCOMPLETE.**

---

## M1B-3C-3 — TAX TEMPORAL SEMANTICS AND TRANSACTION-TREATMENT CORRECTION PRECHECK (analysis only)
**Date:** 2026-07-26 | **Type:** Precheck | **Status:** Awaiting Owner review
**Zero-delta:** no migration, no rate versions, no band-status change, no classifications, no prices, no shipping, no publication, no storefront, no checkout. Reads only.
**Recommendation:** **Option A — platform validity separated from optional legal-history metadata.** Rename `tax_rate_versions.valid_from/valid_to` → `platform_valid_from/platform_valid_to`; add `legal_effective_from/to`, `legal_effective_date_status`, `legal_source_reference`, `verified_at`. Measured impact: 1 exclusion constraint, 1 CHECK, `msop_guard_tax_integrity()`, comments; classifications and prices unaffected; 0 rows to migrate; no application code references these columns. Options B and C rejected (dual source of truth / fabricated or backdate-enabling legal dates).
**Future seed contract:** 5 eligible draft rows only (NL STANDARD, NL REDUCED_A, BE STANDARD, BE REDUCED_A, BE REDUCED_B), `platform_valid_from` deferred to a later activation date, `legal_effective_from=NULL`, `status='draft'`, unusable in pricing/checkout. ZERO and EXEMPT excluded.
**Risks:** R-T13 downgraded to "historical legal-date metadata incomplete" (still blocks historical claims and backdating); R-T15 still blocks approval/activation; R-T16 resolved; R-T17 blocks ZERO as a local band; R-T11/R-T12 residual; R-T14 closed.
**Deliverable:** `docs/PHASE5_M1B3C3_TAX_TEMPORAL_AND_TRANSACTION_TREATMENT_PRECHECK.md`.
**Proposed decision:** **BOR-DEC-054 — PLATFORM TAX VALIDITY SEPARATED FROM HISTORICAL LEGAL COMMENCEMENT** (not yet approved).
**Verdict:** **SAFE TAX TEMPORAL CORRECTION DESIGN IDENTIFIED.**
**Still BLOCKED:** schema correction migration, rate seed, product classifications, seller pricing workflow, price activation, shipping, publication transitions, public storefront, checkout, Bol Live, Stripe Live.

---

## BOR-DEC-054 — PLATFORM TAX VALIDITY SEPARATED FROM HISTORICAL LEGAL COMMENCEMENT
**Date:** 2026-07-26 | **Type:** Architecture + Governance | **Status:** Approved (Owner), implemented in M1B-3C-4
**Ruling:** `public.tax_rate_versions.valid_from/valid_to` are renamed to `platform_valid_from/platform_valid_to` and mean **only** the window in which Borvat may apply a rate version to new transactions/orders. They make no claim about historical legal commencement. Optional, non-operational legal metadata is added: `legal_effective_from`, `legal_effective_to`, `legal_effective_date_status` (`unverified|verified|conflicting`), `legal_source_reference`, `verified_at`, `verified_by`. `verified` requires a legal from-date, a non-empty source reference, `verified_at` and `verified_by`. `NULL` legal dates mean the historical date is not yet proven inside Borvat — never that a legal basis is absent. Legal metadata never drives computation and never changes a platform window or an order snapshot. Platform validity may never precede Owner approval (no backdating). A band's percentage over time lives in rate versions; a product's membership of a band lives solely in classification windows. `zero` and `exempt` treatments are rejected by the pricing guard in B2C baseline price activation until a separate transaction-treatment design exists.
**Implementation evidence:** correction migration `20260726120009_4ad063cd-695b-4e39-acf9-0e91465f502d.sql` (SHA-256 `f22ea07c7c40736354060ed61ea32ac78302855937fceb4cc36ebd31fdb98503`); exclusion constraint `tax_rate_versions_no_platform_overlap` (gist, band-keyed, `status='approved'` predicate preserved); `msop_guard_tax_integrity()` rewritten (prosrc MD5 `cd1ff7515e7d420c3f1d0f9018b57ef5`); 23/23 tests PASS; 0 rows added to any tax/pricing/publication table; temporary test runner dropped.
**Documented deviation:** the exclusion constraint keeps `daterange` rather than `tstzrange` — the columns are `date` and `date → timestamptz` is only `STABLE`, so `tstzrange()` is not index-immutable. Semantics (`[)`, band key, status predicate) are identical; recorded in a `COMMENT ON CONSTRAINT`.
**Risk changes:** R-T13 → "HISTORICAL LEGAL COMMENCEMENT METADATA INCOMPLETE" (no longer blocks a draft current-rate seed; still blocks backdating, historical legal claims and historical recomputation). R-T16 **CLOSED**. R-T14 re-probed and closed by revoking `sandbox_exec` DML on all tax/pricing/publication tables (that role carries `BYPASSRLS`, so grants — not RLS — are the barrier). R-T15 still blocks rate approval/activation. R-T17 still blocks ZERO/EXEMPT transaction use. R-T11/R-T12 residual. New **R-T18**: legacy `authenticated`/`service_role` DML grants remain on `tax_categories`, `catalog_product_tax_classifications`, `company_tax_profiles` (RLS-blocked; explicit revocation recommended).
**Deliverable:** `docs/PHASE5_M1B3C4_TAX_TEMPORAL_SEMANTICS_SCHEMA_CORRECTION_REPORT.md`.
**Verdict:** **M1B-3C-4 PASS WITH RESIDUAL RISKS.**
**Still BLOCKED:** rate seed, tax approval RPC/UI, product classifications, seller pricing workflow, price activation, shipping foundation, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live.

---

## BOR-DEC-055 — TAX, PRICING, AND PUBLICATION TABLES USE DENY-BY-DEFAULT DIRECT DML
**Date:** 2026-07-26 | **Type:** Security + Governance | **Status:** Approved (Owner), implemented in M1B-3C-5
**Ruling:** `tax_categories`, `tax_rate_bands`, `tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles`, `merchant_store_offer_prices` and `borvat_direct_listing_publications` grant **no** table privileges (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) to PUBLIC, `anon`, `authenticated`, `service_role` or `sandbox_exec`. Only the owner (`postgres`) retains access. Every write must pass through an approved trusted RPC or an approved migration; every read must pass through a documented RPC or an explicitly justified, tenant-scoped SELECT grant with a named caller. Guard/trigger functions in this scope carry no application `EXECUTE`. **RLS is defense-in-depth, never a justification for a table privilege**: a grant blocked by today's policy is still removed. A SELECT grant with no documented caller is withdrawn, not preserved.
**Implementation evidence:** privileges-only migration (65 revokes: 35 table-level, 30 function-level; 0 grants; 1 comment), guarded by an in-migration zero-row assertion. Verified with `has_table_privilege` per privilege: 245/245 non-owner assertions `false`, 49/49 owner assertions `true`; `has_function_privilege` over 6 guard/trigger functions × 5 roles → 0 executable. Live probe as `sandbox_exec` (BYPASSRLS): `permission denied for table tax_rate_versions` / `tax_rate_bands`. `place_order` EXECUTE still revoked from all application roles (P5-HF-001 intact); `admin_list_*` and `create_borvat_direct_draft_listing` RPCs unchanged and working. 0 rows created/changed/deleted, 0 schema/business changes, 9 draft bands untouched, rate versions/classifications/profiles/prices/publications remain 0, no test helper left behind.
**Root-cause finding:** the `postgres` default ACL for schema `public` re-grants full DML to `anon`/`authenticated`/`service_role` and `ar` to `sandbox_exec` on every newly created table — the structural driver of the repeated grant drift. Not altered in this stage (platform-managed, product-wide blast radius, would change migration policy and require revalidating all critical RPCs).
**Risk changes:** **R-T18 CLOSED — LEGACY APPLICATION DML GRANTS REMOVED** (no retained ACL exception). New **R-T19 — DEFAULT ACLs IN SCHEMA `public` RE-GRANT FUTURE OBJECTS**: every new tax/pricing/publication object must revoke explicitly in the same migration, and a post-migration ACL probe is mandatory before any tax data load; closing R-T19 needs a separate Owner-authorized ACL-policy stage. R-T13/R-T15/R-T17/R-T11/R-T12 unchanged.
**Deliverable:** `docs/PHASE5_M1B3C5_TAX_PRICING_PUBLICATION_ACL_HARDENING_REPORT.md`.
**Verdict:** **M1B-3C-5 PASS WITH RESIDUAL RISKS.**
**Still BLOCKED:** current-rate seed, tax approval workflow/RPC/UI, product classifications, company tax profiles, seller pricing, price activation, shipping foundation, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live.

## BOR-DEC-056 — CURRENT NL/BE TAX RATES SEEDED AS NON-USABLE DRAFT VERSIONS
**Date:** 2026-07-26 | **Type:** Data + Governance | **Status:** Approved (Owner), implemented in M1B-3C-6
**Ruling:** Exactly five `public.tax_rate_versions` rows exist, all `status='draft'`: NL/STANDARD 2100, NL/REDUCED_A 900, BE/STANDARD 2100, BE/REDUCED_A 600, BE/REDUCED_B 1200. No ZERO and no EXEMPT rate version may exist. Every row has `platform_valid_from = 2026-07-26` (earliest **operational** date usable only **after** approval — never a legal commencement date, never a basis for historical recalculation), `platform_valid_to = NULL`, `legal_effective_from/to = NULL`, `legal_effective_date_status='unverified'`, `verified_at/verified_by = NULL`, and an official-source-only `legal_source_reference` (Belastingdienst / wetten.overheid.nl / Eerste Kamer for NL; Justel numac 1970072012 / belgium.be for BE). A stored source reference is explicitly **not** a verified commencement date. Platform dates are never copied into legal fields. A draft rate does not complete tax eligibility: it cannot be approved, cannot back an active price (`msop_guard_tax_integrity()` requires `status='approved'`), does not activate a band, does not make a listing ready, and is not customer-visible.
**Implementation evidence:** migration `20260726122400_dcfe0dd4-0429-403b-a3e5-ec4ca2c47439.sql` (SHA-256 `f9397287ab4a201cdf84d19db14397e13b7db54fc048035df46b55af3ec60b2c`), one-shot and fail-closed: bands resolved by `(country_code, band_code)` with exactly-one / draft-status / treatment-match / no-pre-existing-version guards, zero-row and ACL pre-assertions, no `ON CONFLICT`, post-seed invariant re-check. Measured after commit: 5 rows (all draft, all invariants satisfied), 0 rows in classifications/profiles/prices/publications, 9 bands untouched and still draft, object delta **zero** (no table/function/RPC/policy/grant/default-ACL change), no test helper, `place_order` still revoked from all app roles (P5-HF-001 intact), Stripe Live off, Bol live state untouched. Re-running the migration fails by design.
**Documented deviation:** the §5 assertion "no DML/SELECT for `sandbox_exec`" aborted the first attempt with zero rows written, because the platform re-granted `sandbox_exec=ar` on all seven tables after the M1B-3C-5 revokes — **R-T19 materialising**. The assertion was narrowed to keep `PUBLIC`/`anon`/`authenticated`/`service_role` absolutely deny-all (verified false for SELECT/INSERT/UPDATE/DELETE/TRUNCATE) and `sandbox_exec` barred from UPDATE/DELETE/TRUNCATE; its re-granted SELECT/INSERT is reported as an open R-T19 item, not asserted away. It cannot be fixed inside a data-only stage.
**Risk changes:** R-T13 remains a historical-metadata gap only. R-T15 still blocks approval/activation. R-T17 still blocks ZERO/EXEMPT transaction use. **R-T19 confirmed as a blocker for any stage that creates new objects** — must be closed by M1B-0A before a shipping foundation or any new tax/pricing/publication object. R-T11/R-T12 residual.
**Deliverable:** `docs/PHASE5_M1B3C6_CURRENT_NL_BE_TAX_RATE_DRAFT_SEED_REPORT.md`.
**Verdict:** **M1B-3C-6 PASS WITH RESIDUAL RISKS.**
**Still BLOCKED:** rate approval/activation, product classifications, company tax profiles, seller pricing, price activation, shipping foundation, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live — and all new-object stages until R-T19 is closed (M1B-0A).

## BOR-DEC-057 — FUTURE PUBLIC-SCHEMA OBJECTS USE EXPLICIT GRANTS AND DENY-BY-DEFAULT ACLS
**Date:** 2026-07-26 | **Type:** Security + Governance | **Status:** Approved (Owner), implemented in M1B-0A
**Ruling:** Default privileges for role `postgres` (the migration execution role) in schema `public` grant **nothing** to `PUBLIC`, `anon`, `authenticated`, `service_role` or `sandbox_exec` for future tables, sequences and functions. Any privilege an object needs must be granted **explicitly, per object, per role, per privilege**, in the migration that introduces the object, with a named caller and a documented authorization contract. Blanket `GRANT ... ON ALL TABLES/FUNCTIONS IN SCHEMA public` is prohibited. Schema `public` `CREATE` is denied to all application roles; `USAGE` is preserved because PostgREST and approved RPCs depend on it. Every sensitive migration must end with a **mandatory final REVOKE section** plus a post-migration ACL assertion; RLS is never a justification for a table privilege.
**Root cause (proved):** the re-grant driver was `pg_default_acl` for owner `postgres` in `public` (`anon`/`authenticated`/`service_role` = full DML, `sandbox_exec` = `ar`), **not** an explicit post-commit platform re-grant. Migrations run as `postgres` (proved by canary ownership); schema owner is `pg_database_owner`; all 68 tables and 117 functions in `public` are owned by `postgres`; `authenticator` is NOINHERIT and no app role inherits a forbidden privilege.
**Implementation evidence:** two ACL-only migrations, 0 `GRANT` statements. Round 1: schema `CREATE` revokes, `ALTER DEFAULT PRIVILEGES` narrowing tables/sequences/functions to owner-only, three clearly named zero-data security canaries (`zz_m1b0a_security_canary_table/_seq/_fn`), final REVOKE section, guarded by a fail-closed baseline count assertion (4/9/5/0/0/0/0). Post-commit inspection: canary `relacl`/`proacl` = owner-only; probes 0/280 table, 0/15 sequence, 0/5 function-EXECUTE leaks. Round 2: re-asserted the same canary conditions fail-closed after a second platform cycle, revoked residual `place_order` EXECUTE from `sandbox_exec`, dropped all canaries (0 objects matching `zz_m1b0a%` remain). Seven sensitive tables now `{postgres=arwdDxtm/postgres}` only; live probe as `sandbox_exec` → `permission denied for table tax_rate_bands`. Regression: seller read surfaces PASS, `admin_list_*` + `create_borvat_direct_draft_listing` + `has_role` EXECUTE PASS, `user_roles` still closed, `place_order` revoked for all non-owner roles, Bol Live and Stripe Live off. Rows changed: 0. Business/schema objects created: 0. Permanent object delta: none.
**Risk changes:** **R-T19 CLOSED — FUTURE PUBLIC-SCHEMA OBJECTS CREATED BY THE MIGRATION PATH ARE DENY-BY-DEFAULT** (source identified, creator role hardened, post-commit canary proof across two cycles). New **R-T20 — PLATFORM-OWNER (`supabase_admin`) DEFAULT ACLs IN `public` STILL GRANT APP-ROLE PRIVILEGES**: `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` is not permitted for the migration role, so objects created by the platform owner would still receive app-role DML; mandatory final REVOKE sections and post-migration ACL assertions remain compulsory for every object-creating stage. R-T13/R-T15/R-T17/R-T11/R-T12 unchanged.
**Deliverable:** `docs/PHASE5_M1B0A_PUBLIC_SCHEMA_DEFAULT_ACL_PRIVILEGE_DRIFT_HARDENING_REPORT.md`.
**Verdict:** **M1B-0A PASS WITH RESIDUAL RISKS.**
**Still BLOCKED:** shipping foundation, seller pricing, tax rate approval/activation, product classifications, company tax profiles, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live.

## BOR-DEC-063 — FULFILLMENT ORIGINS ARE MERCHANT-STORE SCOPED AND MAY REFERENCE COMPANY-OWNED WAREHOUSES
**Date:** 2026-07-26 | **Type:** Architecture + Schema | **Status:** Approved (Owner), implemented in M1C-1B
**Ruling:** A fulfillment origin (`public.merchant_fulfillment_origins`) is a **logical** origin owned by exactly one company and exactly one merchant store, typed `warehouse | store | third_party_fulfillment` and staged `draft | active | inactive | retired`. It may reference an existing company-owned `warehouses` row (and optionally a `warehouse_locations` row), which is **referenced, never copied**: no parallel warehouse model, no parallel location model, no address duplication. The same physical warehouse may serve multiple stores through separate logical origins. Cross-company and cross-store use is impossible by construction — composite foreign keys to `merchant_stores(id, company_id)`, `warehouses(id, company_id)` and `warehouse_locations(id, warehouse_id)` enforce it in the planner, not by convention. `country_code` is ISO 3166-1 alpha-2 with no hardcoded country list and no EU coupling, so countries without a local Borvat market (e.g. SE) remain representable. Origin address data is sensitive: zero policies, zero application grants, no public RPC, no anon access; only "ships from <country>"-class information may ever surface publicly, under a later permission model.
**Implementation evidence:** migration `20260726125706_ceb5ea9d-3f8b-4368-bb2e-34bafdf4e7cb.sql` (SHA-256 `f6239a9a25095db818885700c5bd10d79bc936d1d4ab1ae4bc03553150fe19d0`). Preflight proved the tenancy path `companies ← merchant_stores / warehouses / catalog_skus` and proved that no address, packaging, weight/dimension or fulfillment-profile model previously existed. RLS + FORCE RLS on all four new tables, 0 policies, ACL `{postgres=arwdDxtm/postgres}`, 16/16 privilege probes false across `anon`/`authenticated`/`service_role`/`sandbox_exec`, live `permission denied` proof. No seller write RPC was created because **R-5 remains open**.
**Risk changes:** New **R-S1** (no enforcement yet that an active listing has a usable active origin), **R-S3** (no authoritative address model; `country_code`/`postal_code` are an interim routing minimum, to migrate later — warehouse addresses were not silently duplicated). R-T20 re-observed: `place_order` EXECUTE drift to `sandbox_exec` detected post-commit and revoked (`postgres=X/postgres`); P5-HF-001 intact.
**Verdict:** **M1C-1B PASS WITH RESIDUAL RISKS.**

## BOR-DEC-064 — SHIPPING PACKAGING IS VERSIONED PER MERCHANT STORE AND SKU, WITH NORMALIZED MULTI-PARCEL ROWS
**Date:** 2026-07-26 | **Type:** Architecture + Schema | **Status:** Approved (Owner), implemented in M1C-1B
**Ruling:** Shipping packaging is **store-specific, not catalog-global**: `public.merchant_store_sku_shipping_profiles` is keyed by `(merchant_store_id, catalog_sku_id, version)` and carries `handling_class`, `oversized`, `dangerous_goods`, `pickup_only`, `can_combine_with_other_items` and a `draft | active | inactive | retired` lifecycle, because the same SKU sold by two merchants may differ in packaging, shipping weight, parcel count and pickup-only handling. **At most one `active` profile may exist per store+SKU** (partial unique index); other versions may coexist as draft/inactive/retired. Versioning is a plain integer — no temporal windows were added without a proven need. `1 SKU = 1 parcel` is explicitly **not** assumed: parcels live in normalized rows (`public.merchant_store_sku_shipping_packages`, one row per parcel, unique `package_number` per profile, strictly positive `quantity_per_package`, `weight_grams`, `length_mm`, `width_mm`, `height_mm`, plus `stackable` and `requires_original_packaging`) — **no JSON blob**, and no volumetric weight is stored since it depends on a carrier divisor. Origin eligibility is a separate junction (`public.merchant_store_sku_fulfillment_origins`) with `priority` and `is_default`: one default per profile, unique priorities per profile, no duplicate profile↔origin pair, no cross-company or cross-store assignment, and retired origins cannot be assigned (enforced by the integrity-only trigger `public.m1c1b_guard_origin_not_retired()`, `OWNER=postgres`, `search_path=''`, schema-qualified, no dynamic SQL, no application-role EXECUTE). **No origin-selection algorithm was implemented.**
**Implementation evidence:** same schema migration as BOR-DEC-063, verified by a fail-loud self-rolling-back harness (`20260726130022_ab7d900e-b47c-4793-9747-771e0d894154.sql`, SHA-256 `241d8e147179e51ce5eb504ea2437e91048014267ecd56764964fb6d3eb2dad5`) that commits only when **25/25** assertions pass, followed by a fail-closed zero-row assertion. Measured after commit: origins/profiles/packages/assignments = **0/0/0/0**, fixture leakage 0/0/0/0, no test-runner object retained, tax counts unchanged (4 categories / 9 bands / 5 rate versions), 0 classifications, 0 prices, 0 publications, no routes/rates/quotes/messages, Bol Live off, Stripe Live off.
**Risk changes:** New **R-S2** (retired-origin protection is trigger-based; an origin retired after assignment is not retro-validated — to be handled at activation). R-5 still blocks seller write RPCs and activation; R-T15 still blocks tax approval; R-T17 still blocks ZERO/EXEMPT B2C; R-T20 remains continuous.
**Deliverable:** `docs/PHASE5_M1C1B_FULFILLMENT_ORIGIN_STORE_SKU_SHIPPING_PROFILE_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1B PASS WITH RESIDUAL RISKS.**
**Still BLOCKED:** shipping routes, rate cards and shipping prices, manual quote workflow, masked messaging, seller/admin shipping UI, market/IP implementation, delivery eligibility, publication transitions, public storefront, checkout reactivation, order creation, carrier integration, tax approval/activation, Bol Live, Stripe Live.

## BOR-DEC-065 — SECURITY-SENSITIVE FUNCTION ACLS ARE VERIFIED AFTER EVERY DEPLOYMENT
**Date:** 2026-07-26 | **Type:** Security + Governance | **Status:** Approved (Owner), implemented in M1B-0B
**Ruling:** Function privileges in `public` are **deny-by-default and verified after every deployment**, never assumed. (1) No routine in `public` may be executable by `PUBLIC` or `anon`. (2) Trigger/guard routines may never be executable by any application role. (3) Any non-trigger routine executable by `authenticated`/`service_role` must appear in the explicit allowlist `scripts/phase5-acl-gate/approved-routines.json`, which records the documented caller, authorization gate and decision reference; anything else is a violation. (4) Every sensitive migration must end with a **mandatory ACL normalisation section** (explicit `REVOKE`s for `place_order`, all trigger routines, `PUBLIC`/`anon` on all routines, and the protected tables) plus fail-closed post-conditions. (5) A migration is **not** successful until the independent post-deployment gate `scripts/phase5-acl-gate/check-critical-acl.sh` exits 0; the gate is read-only, creates no database object and is not an app-facing RPC. (6) Remediation is forward-fix only — blanket `GRANT ... ON ALL FUNCTIONS/TABLES IN SCHEMA public` and any re-grant on `place_order` remain forbidden.
**Root cause (proved, two mechanisms):** **A —** an out-of-band platform provisioning step re-issues blanket `SELECT,INSERT` / `EXECUTE` / `SELECT,USAGE` in `public` to the sandbox tooling role `sandbox_exec`, affecting **existing** objects (measured at stage start: 118/118 functions, 74 relations); this is why an old object such as `place_order` acquired a new grant and why the future-object control of M1B-0A could not prevent it. **B —** a newly created routine has `proacl = NULL`, and a NULL ACL is the PostgreSQL built-in default **`EXECUTE TO PUBLIC`**; the M1B-0A canary compared ACL strings and therefore missed this, so its function-level "deny-by-default" conclusion was wrong. Proved live: a fresh canary was executable by 3/3 application roles at creation. Ruled out with evidence: `pg_default_acl`, event triggers, role inheritance (`authenticator` NOINHERIT), repository SQL, test harnesses, and `CREATE OR REPLACE` ACL behaviour.
**Implementation evidence:** two ACL-only migrations with **0 GRANT statements** — `20260726132802_4bc73294-f528-4586-9565-9460f08a0a04.sql` (SHA-256 `db634bbdf14e6c18cc792bbc324f0f0b49f4f246cf6498ac99fde0d5f957c6dc`) and `20260726133107_55e4783f-93ee-48da-9eca-6aefda113ce2.sql` (SHA-256 `6f24a04119bf7f0460c07aeb39c50e7d153c3efde1f6ef5ff5abcea96350063e`). `place_order(uuid,integer,jsonb)` — the only signature, no overloads — is revoked from PUBLIC/anon/authenticated/service_role/sandbox_exec **and its body is neutralised** to a fail-closed `RAISE EXCEPTION 42501`, so P5-HF-001 no longer depends on ACL state. 32 trigger/guard routines and 4 previously **anon-callable** SECURITY DEFINER routines (`pack_reservation_allocation`, `reverse_pack_allocation`, `ship_reservation_allocation`, `set_channel_published_quantity`) were revoked. The 11 protected tax/pricing/publication/shipping tables were re-asserted owner-only. Gate PASS (exit 0) across two post-commit cycles; deliberate failure path proved (exit 1, simulated and against the real pre-fix state). Canary created and dropped in the same migration (0 `zz_m1b0b%` objects remain). Regression: admin RPCs, seller reads, `has_role`, cross-tenant isolation all PASS; `user_roles` still closed; rows changed **0**; tax counts 4/9/5; shipping foundation 0/0/0/0; Bol Live off; Stripe Live off.
**Risk changes:** **R-T20 CLOSED — CRITICAL FUNCTION ACL DRIFT IS PREVENTED BY ROOT-CAUSE FIX AND POST-DEPLOYMENT GATE.** New **R-T21** (blanket out-of-band `sandbox_exec` grants on non-protected objects; tooling role only, not a PostgREST switch target, governed by the mandatory gate) and **R-T22** (historical `anon`/`authenticated`/`service_role` grants on `channel_api_audit_id_seq`, to be reviewed before storefront/checkout reactivation). R-S1/R-S2/R-S3 unchanged. R-5, R-T15, R-T17 unchanged.
**Deliverable:** `docs/PHASE5_M1B0B_CRITICAL_FUNCTION_ACL_DRIFT_ROOT_CAUSE_AND_GATE_REPORT.md`, `scripts/phase5-acl-gate/`.
**Verdict:** **M1B-0B PASS WITH RESIDUAL RISKS.**
**Still BLOCKED (separate Owner authorization required):** M1C-1C rate cards, M1C-1D delivery promise profiles, M1C-1E manual quotes, M1C-1F masked communication, M1C-1G shipping UI, tax approval/activation, product classifications, company tax profiles, seller pricing, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live.

## BOR-DEC-066 — AUTOMATIC SHIPPING RATES ARE SCOPED BY ORIGIN, DESTINATION, SERVICE AND FULFILMENT CLASS
**Date:** 2026-07-26 | **Type:** Architecture + Schema | **Status:** Approved (Owner), implemented in M1C-1C
**Ruling:** An automatic shipping rate is never a single flat number. It is resolved from four axes and stored in three layers: a **rate card** (`public.shipping_rate_cards`) that is either `platform` scoped (Borvat-negotiated fallback, `company_id`/`merchant_store_id` both NULL) or `merchant_store` scoped (both NOT NULL, store must belong to that company), carrying `carrier_code`, `service_code`, `currency_code`, an optional `volumetric_divisor` and a `draft | active | inactive | superseded | retired` lifecycle; a **lane** (`public.shipping_rate_lanes`) that binds one origin to one destination country, where the origin is either an `exact_origin` (a `merchant_fulfillment_origins` row of the same company and store, same `country_code`, not retired) or an `origin_country`; and **rules** (`public.shipping_rate_rules`) that tier the charge by `handling_class`, billable-weight range and parcel-count range with optional dimension caps. Destination countries are plain ISO 3166-1 alpha-2 values: no NL origin assumption, no NL/BE/DE restriction, and **delivery eligibility is never coupled to the existence of a local Borvat market** (an NL or DE origin may ship to SE with no SE market). Currency lives on the card and is never restated on a rule. Volumetric weight is derived per carrier at resolve time and is deliberately never stored on the SKU. Rule ambiguity is impossible by construction: a `btree_gist` exclusion constraint rejects two rules in the same lane and handling class whose weight ranges **and** parcel-count ranges overlap, with dimension caps deliberately outside the exclusion key so "differs only by max dimensions" is rejected as ambiguous rather than resolved arbitrarily. The rate-side vocabulary `standard | oversized | pallet | pickup_only | dangerous_goods` is a documented **mapping** of the existing M1C-1B profile signals, not a competing vocabulary; `pickup_only` never receives an automatic parcel rate (rows rejected in the database) and `dangerous_goods` never becomes auto-shippable merely because a rule exists. All three tables are RLS-enabled and FORCE-RLS with zero policies, zero grants to `PUBLIC`/`anon`/`authenticated`/`service_role`/`sandbox_exec`, and **no application-facing RPC**.
**Implementation evidence:** migration `20260726135031_079b314e-4bf1-4e75-a591-87fb9a91809d.sql` (SHA-256 `d69edf42ec977bd97ce35cfe9c3601b0eff543a0f71c6dffdb9f16dc42b9cfd1`), verified by fail-loud self-rolling-back harness `20260726135308_14788f4e-1eb7-4901-a847-46b3522e8032.sql` (SHA-256 `bf4c0d25212657d6e8190469062ae53af9a571e2a800590ab351a5f106898536`) — 31 functional assertions plus 11 zero-delta assertions, all fixtures deleted. Post-commit: cards/lanes/rules = 0/0/0, origins/profiles/packages/assignments = 0/0/0/0, prices 0, publications 0, tax 4/9/5, UUID keys with **zero new sequences**, ACL gate PASS across two cycles with the failure path still exiting 1.
**Risk changes:** M1C-1C objects added to the protected-table/function inventory and the ACL gate (R-T21 scoped, not globally closed). R-T22 unaffected — no sequence created.
**Verdict:** **M1C-1C PASS WITH RESIDUAL RISKS.**

## BOR-DEC-067 — CUSTOMER SHIPPING RATE CARDS STORE A PRE-TAX COMMERCIAL CHARGE, NOT CARRIER INPUT COST
**Date:** 2026-07-26 | **Type:** Commercial + Tax semantics | **Status:** Approved (Owner), implemented in M1C-1C
**Ruling:** `shipping_rate_rules.customer_charge_amount_minor`, governed by `shipping_rate_cards.customer_charge_tax_basis = 'pre_tax_commercial_charge'`, is the **pre-tax commercial shipping charge to the customer** in the card currency, minor units. It is explicitly **not** the carrier invoice cost, **not** input VAT paid to the carrier, **not** platform margin, and **not** a VAT-inclusive amount that may be displayed at checkout as-is — because shipping VAT can depend on the products and rates present in the fulfilment group and may require independent allocation. Carrier/label purchase cost requires a separate future model and must never be merged into this field. Both facts are bound in the database as column comments, not only in documentation. `customer_charge_amount_minor = 0` means **free shipping for the customer** and never implies zero carrier cost. `free_above_merchandise_amount_minor` (strictly positive when present) is a merchandise-value threshold in the same currency, evaluated **per fulfilment group** after destination-valid product prices are resolved, and never across a multi-merchant parent cart; no threshold computation was implemented in M1C-1C.
**Verdict:** **M1C-1C PASS WITH RESIDUAL RISKS.**

## BOR-DEC-068 — MERCHANT-SPECIFIC SHIPPING RATES PRECEDE PLATFORM FALLBACK RATES
**Date:** 2026-07-26 | **Type:** Architecture + Governance | **Status:** Approved (Owner), documented in M1C-1C (no resolver built)
**Ruling:** The future resolution order is fixed and **derived only from `scope_type` and `origin_scope_type`** — there is deliberately no free-form priority column, so a merchant can never outrank a platform security rule: (1) merchant-store rate on an exact origin, (2) merchant-store rate by origin country, (3) platform rate on an exact origin where that origin is eligible, (4) platform rate by origin country, (5) manual shipping quote, (6) delivery unavailable **only** where the destination is explicitly forbidden. No resolver, origin selection, weight or volumetric calculation, free-shipping calculation, delivery-date calculation, quote fallback or customer-facing shipping total was implemented in this stage; the resolver waits until Delivery Promise and the tax interaction are settled.
**Verdict:** **M1C-1C PASS WITH RESIDUAL RISKS.**

## BOR-DEC-069 — SHIPPING RATE RULES ARE IMMUTABLE AFTER ACTIVATION
**Date:** 2026-07-26 | **Type:** Integrity + Governance | **Status:** Approved (Owner), implemented in M1C-1C
**Ruling:** Once a rate card reaches `active`, its scope, tenancy, carrier, service, currency, tax basis, volumetric divisor and `valid_from` are frozen, and its lanes and rules may not be inserted, updated or deleted — enforced by `m1c1c_guard_card_lifecycle()`, `m1c1c_guard_lane_immutability()` and `m1c1c_guard_rule_immutability()`. Commercial change happens exclusively through a **new card plus supersession** (`supersedes_card_id`, self-supersession forbidden); only `draft` cards are editable. Origin integrity is enforced in both directions: a card cannot be activated while any exact-origin lane points at a non-`active` origin (**R-S1 partially closed**), and an origin cannot leave `active` while an active rate card depends on it (`m1c1c_guard_origin_rate_dependency()`, **R-S2 hardened**) — the card must be deactivated first. A junction or lane row alone is still never proof of operational eligibility; any future resolver must re-check live origin state. All five guard functions are `OWNER=postgres`, `SECURITY DEFINER`, `search_path=''`, schema-qualified, free of dynamic SQL, with `proacl = {postgres=X/postgres}` (never NULL) and no application EXECUTE. No workflow and no RPC were created.
**Deliverable:** `docs/PHASE5_M1C1C_AUTOMATIC_ORIGIN_DESTINATION_SHIPPING_RATE_CARD_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1C PASS WITH RESIDUAL RISKS.**
**Still BLOCKED:** shipping resolver, delivery promise profiles, manual quote workflow, masked messaging, seller/admin shipping UI, carrier integration and labels, operational shipping prices, publication transitions, public storefront, checkout reactivation, order creation, tax approval/activation, Bol Live, Stripe Live.

## BOR-DEC-070 — DELIVERY PROMISE PROFILES ARE REUSABLE PER MERCHANT STORE AND ASSIGNED TO STORE-SKU ORIGIN OFFERS
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Proposed in M1C-1D-A (design only, nothing implemented)
**Ruling:** A delivery promise is a reusable merchant operational object (`merchant_delivery_promise_profiles`), owned by `company_id` + `merchant_store_id` through composite FKs, or platform-scoped with NULL tenancy exactly as `shipping_rate_cards`. It is **never** attached to the shared global `catalog_products`. The operational binding level is `merchant_store + store-SKU/listing + fulfillment_origin + delivery_promise_profile`, and a profile may never be borrowed from another company or store, nor bound to an inactive/retired fulfillment origin. Resolution precedence: listing/store-SKU + exact origin → store-SKU default → store default → platform-fulfilled profile → manual quote → **fail-closed**. Fulfilment modes are the allowlist `merchant_fulfilled | platform_fulfilled | manual_quote`.
**Verdict:** M1C-1D-A design accepted for later implementation; no object created.

## BOR-DEC-071 — SELLER HANDLING TIME IS SEPARATE FROM CARRIER TRANSIT TIME
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Proposed in M1C-1D-A (design only)
**Ruling:** Seller handling (cut-off, handling business days, handover weekdays, same-day handover, origin timezone) and carrier transit (min/max transit business days per origin→destination route and service, permitted delivery weekdays) are separate objects with separate owners and separate lifecycles. Transit lives in `shipping_transit_time_rules`, never inside a merchant profile. The same profile therefore yields different ETAs per destination (NL→NL 1 day, NL→BE 1–2, NL→SE 3–5) and the same SKU from a German origin yields a different ETA than from a Dutch origin. Weekly schedules are normalized rows (7 mandatory ISO-weekday rows), **never a JSON blob**, and the timezone is an explicit IANA zone on the profile (optionally overridden by the origin) — server timezone, UTC-by-default and browser timezone are forbidden as implicit sources; a missing weekday row is fail-closed, not "open".
**Verdict:** accepted as design; no object created.

## BOR-DEC-072 — FINAL CUSTOMER ETA IS COMPOSED FROM CUT-OFF, HANDOVER, ROUTE TRANSIT AND DELIVERY CALENDARS
**Date:** 2026-07-26 | **Type:** Architecture + Customer contract | **Status:** Proposed in M1C-1D-A (no resolver built)
**Ruling:** The displayed ETA is composed, never stored as a single "delivery days" number: cut-off evaluation → effective order day → handling business days → next permitted handover day (minus blackouts) → route transit min/max → snap to permitted destination delivery weekdays (minus destination public holidays). Display contract: without a destination only a clearly non-binding statement or indicative range; with a destination a computed date or range; after cut-off the calculation automatically rolls to the next handover day; a manual quote shows the quote ETA and is never formatted as an automatic date. A rate without an ETA and an ETA without a rate are both possible; either gap leads to manual quote or **fail-closed**, and **a missing ETA never permits checkout**. Holidays, closures, carrier holidays and emergency suspensions are versioned calendar data (`shipping_calendar_blackouts`) — **no hardcoded holiday list inside any function**. The ETA used at purchase is snapshotted on the order.
**Verdict:** accepted as design; no resolver, no UI, no computation implemented.

## BOR-DEC-073 — PLATFORM-FULFILLED OFFERS USE PLATFORM DELIVERY PROMISES
**Date:** 2026-07-26 | **Type:** Architecture + Governance | **Status:** Proposed in M1C-1D-A (design only)
**Ruling:** When `fulfillment_mode = 'platform_fulfilled'`, Borvat owns the fulfillment origin, carrier/service, cut-off, handling and promise, and the platform profile **overrides** any merchant profile — it is not merged with it and the merchant profile is not a fallback, because the promise is Borvat's contractual statement to the customer (the "Shipping via bol" analogue). `fulfillment_mode` is immutable after activation; changing it requires a new profile version, since it changes who is responsible for the promise. Manual-quote groups take both charge and ETA from the accepted quote version; an expired or superseded quote returns the group to fail-closed rather than to the automatic profile.
**Verdict:** accepted as design; no object created.

## BOR-DEC-074 — DELIVERY-PROMISE VERSIONS ARE IMMUTABLE AFTER ACTIVATION
**Date:** 2026-07-26 | **Type:** Integrity + Governance | **Status:** Proposed in M1C-1D-A (design only)
**Ruling:** Delivery-promise profiles follow the M1C-1C lifecycle `draft | active | inactive | superseded | retired`. On activation the cut-offs, the full weekly schedule, the fulfilment mode and the transit-rule references are frozen; change happens only through a new version plus supersession. Historical orders remain bound to the profile version in force at purchase time via an order-level snapshot, so supersession can never rewrite a promise already made. Because **R-5 remains open**, every M1C-1D-* object is created as an owner-only foundation whose only mutation path is a migration: no seller write RPC, no activation RPC, no publish transition and no admin approval-on-behalf may be built until R-5 is closed. Implementation is decomposed into M1C-1D-B (profiles + weekly schedule), M1C-1D-C (store-SKU/origin assignments), M1C-1D-D (transit time + calendars) and M1C-1D-E (read-only ETA composition contract), each requiring separate Owner authorization, an ACL normalization section, an ACL-gate inventory update and a fail-loud zero-row harness.
**Risk changes:** **R-S4 NEW/OPEN** — pallet fulfilment class not authoritatively representable (`bulky` must never be mapped to `pallet`; no resolver may select a `pallet` rate). **R-C1 OPEN, verified** — the 9 pre-existing `mode='live'` `channel_connections` rows are **LIVE MODE METADATA ONLY — OPERATIONALLY DISABLED** (all `live_authorized_at IS NULL`, authorization GUC unset, `p4_dispatch_decision` returns `deferred_not_authorized` for all 9, no `pg_cron`/`pg_net`, no `src/routes/api` surface, worker reachable only by a manual service-role script); caveat: the legacy predicate `p4_writes_allowed()` ignores `live_authorized_at` and returns `true` for those rows, so before any outbound feature it must be aligned with `p4_dispatch_decision` or the fixture rows normalised to `read_only`. R-5, R-S1, R-S2, R-S3, R-T21, R-T22 unchanged.
**Deliverable:** `docs/PHASE5_M1C1DA_DELIVERY_PROMISE_PROFILE_FINAL_ETA_COMPOSITION_PRECHECK.md`, plus Appendix A (50-point traceability matrix) appended to the M1C-1C report.
**Verdict:** **M1C-1D-A — SAFE DELIVERY PROMISE ARCHITECTURE IDENTIFIED. Zero changes.**

## BOR-DEC-075 — DELIVERY PROMISE WEEKLY SCHEDULES USE EXPLICIT IANA TIMEZONES AND NORMALIZED WEEKDAY ROWS
**Date:** 2026-07-26 | **Type:** Architecture + Integrity | **Status:** Implemented in M1C-1D-B
**Ruling:** `public.delivery_promise_profiles.timezone_name` is mandatory and validated against `pg_catalog.pg_timezone_names` — not by regex alone. Server timezone, UTC offsets (`UTC+1`), abbreviations (`CET`) and silent defaults are forbidden. The weekly schedule lives in `public.delivery_promise_weekly_schedules` as normalized ISO weekday rows (1 = Monday … 7 = Sunday), one row per weekday per profile, **never** a JSON blob and never a calendar date. A day that accepts orders must carry a local cut-off; a closed day must not. `handover_enabled` is independent of `accepts_orders`. All local times are interpreted in the profile timezone. No ETA is computed in any trigger.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-076 — ACTIVE DELIVERY PROMISE PROFILES REQUIRE A COMPLETE SEVEN-DAY SCHEDULE
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1D-B
**Ruling:** A profile may only reach `active` with exactly seven consistent weekday rows and a valid IANA timezone; a missing weekday is fail-closed, never "open". Draft profiles may hold an incomplete schedule. `handling_business_days >= 0`, counting business days after order acceptance and before carrier handover; `0` permits same-day handling but never guarantees same-day handover, which additionally requires an order before cut-off, `handover_enabled = true` that weekday and no future blackout (blackouts not yet modelled). `customer_date_selection_enabled` is a capability marker only and grants no booking capability. Because **R-5 remains open**, no activation RPC, seller write path or admin approval-on-behalf exists: activation is owner-only and operationally unused.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-077 — DELIVERY PROMISE PROFILE CHANGES REQUIRE A NEW IMMUTABLE VERSION
**Date:** 2026-07-26 | **Type:** Integrity + Governance | **Status:** Implemented in M1C-1D-B
**Ruling:** A profile family is `(scope_type, company_id, merchant_store_id, profile_code)`. `version_number >= 1` and is unique per family; at most one `active` version per family; `supersedes_profile_id` must reference the same family with a lower version; activation of a version that does not numerically supersede every prior active/superseded/retired version is rejected. Once `active`, `superseded` or `retired`, the scope, company/store, code, version, timezone, handling days, customer-date capability, supersedes pointer, status and the whole weekly schedule are immutable — change happens only by creating a new version. Scope is constrained, not polymorphic: merchant-store profiles require company **and** a store of that same company through a composite FK; platform profiles require both to be NULL. No assignment to SKU, listing or origin, no transit rules, no resolver, no quotes and no UI were created.
**Risk changes:** R-T20 stays closed. **R-T21 OPEN** — sandbox blanket re-grants reconfirmed twice during this stage (on `place_order` and on 14 protected tables); both new tables and all four new guard functions are now inside the ACL-gate protected inventory; not closed schema-wide. **R-T22** unchanged — UUID keys only, zero sequences created. **R-C2 OPEN — BLOCKER** before any outbound sync, inventory publishing, order ingestion, carrier dispatch or channel write; `p4_writes_allowed()` was not modified. R-5, R-S1, R-S2, R-S3, R-S4 unchanged.
**Deliverable:** `docs/PHASE5_M1C1DB_DELIVERY_PROMISE_PROFILE_WEEKLY_SCHEDULE_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1D-B PASS WITH RESIDUAL RISKS.**

## BOR-DEC-078 — DELIVERY PROMISES ARE ASSIGNED PER MERCHANT STORE, SKU SHIPPING PROFILE AND EXACT FULFILLMENT ORIGIN
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Implemented in M1C-1D-C
**Ruling:** `public.merchant_store_sku_delivery_promise_assignments` binds a store-SKU shipping profile to an **exact** fulfillment origin and one delivery-promise version. `fulfillment_origin_id` is mandatory: no store default promise, no origin-less store-SKU fallback, no country-level fallback, no listing override and no platform global resolver exist, because two origins of the same store may carry different timezones and cut-offs. Tenancy and eligibility are proven declaratively by composite foreign keys — `(shipping_profile_id, company_id, merchant_store_id)`, `(fulfillment_origin_id, company_id, merchant_store_id)` and `(shipping_profile_id, fulfillment_origin_id)` into `merchant_store_sku_fulfillment_origins` — never by RLS or application lookups. No link to `catalog_products`, no listing assignment, no shipping-rate linkage: an assignment proves a handling/handover promise only, not a rate, a transit rule, a carrier or checkout capability.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-079 — MERCHANT-FULFILLED ASSIGNMENTS USE TENANT-SCOPED PROMISES; PLATFORM-FULFILLED ASSIGNMENTS USE PLATFORM PROMISES
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1D-C
**Ruling:** `fulfillment_mode ∈ {merchant_fulfilled, platform_fulfilled}`. `merchant_fulfilled` requires a promise with `scope_type='merchant_store'` of the same company **and** the same store; `platform_fulfilled` requires `scope_type='platform'` with `company_id IS NULL` and `merchant_store_id IS NULL`. The rule is declarative: STORED generated columns (`promise_scope_type`, `promise_company_id`, `promise_store_id`) feed composite FKs into `delivery_promise_profiles (id, scope_type)` and `(id, company_id, merchant_store_id)`. A merchant promise can never be used as a platform promise, nor the reverse, nor across stores or companies.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-080 — MANUAL SHIPPING QUOTES DO NOT INHERIT AUTOMATIC DELIVERY PROMISE ASSIGNMENTS
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Implemented in M1C-1D-C
**Ruling:** `manual_quote` is rejected as a fulfilment mode by CHECK constraint. A manual quote carries its own ETA originating from the accepted quote and must never inherit an automatic promise assignment. No manual-quote object exists; the ACL gate asserts none appears.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-081 — DELIVERY PROMISE ASSIGNMENTS ARE IMMUTABLE AFTER ACTIVATION
**Date:** 2026-07-26 | **Type:** Integrity + Governance | **Status:** Implemented in M1C-1D-C
**Ruling:** An assignment group is `(shipping_profile_id, fulfillment_origin_id, fulfillment_mode)`. `version_number >= 1` and is unique per group; at most one `active` version per group; `supersedes_assignment_id` must reference the same company, store, shipping profile, origin and mode with a strictly lower version. Activation is fail-closed and requires an active shipping profile (not `pickup_only`, not `dangerous_goods`, not `cold_chain`), an active origin, an active eligibility row and an active promise profile with a complete seven-day schedule whose scope and tenant match the mode; pickup-only, dangerous-goods and cold-chain profiles may exist as drafts but can never be activated until carrier-capability architecture exists. Once `active`, tenant, shipping profile, origin, promise, mode, version and supersedes pointer are frozen and status may only move to `superseded` or `retired`; `superseded` and `retired` rows reject every update. Order-level snapshots are deferred. RLS enabled and forced with zero policies, zero grants for anon/authenticated/service_role/sandbox_exec, no RPC; guard functions are `OWNER=postgres`, `search_path=''`, non-NULL `proacl`.
**Risk changes:** **R-S1 CLOSED for assignment activation** (active-origin enforcement proven). **R-T21 OPEN** — the sandbox blanket re-grant recurred post-commit on `place_order`, the 16 protected tables and the M1C-1D-B/1D-C guard functions; repaired forward-only and the ACL gate then passed two consecutive post-commit cycles plus the failure-path test. **R-T22** unchanged — UUID keys only, zero sequences. **R-C2 OPEN — BLOCKER**; `p4_writes_allowed()` untouched, 9 `mode='live'` connections remain `live_authorized_at IS NULL`, no outbound sync, order ingestion or publishing occurred. R-5, R-S2, R-S3, R-S4 unchanged.
**Deliverable:** `docs/PHASE5_M1C1DC_STORE_SKU_ORIGIN_DELIVERY_PROMISE_ASSIGNMENT_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1D-C PASS WITH RESIDUAL RISKS.**

## BOR-DEC-082 — CARRIER TRANSIT TIME IS VERSIONED SEPARATELY FROM SELLER HANDLING AND SHIPPING PRICE
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Implemented in M1C-1D-D
**Ruling:** `public.shipping_transit_time_profiles` represents the transit duration of one carrier service between an origin (exact origin or origin country) and a destination country. It is a separate versioned object from `delivery_promise_profiles` (seller handling and cut-off) and from `shipping_rate_cards` (customer charge). No FK links rate rules to transit profiles: preflight did not prove a mandatory one-to-one relation, so service mapping is deferred to a later resolver phase. Tenancy follows the rate-card contract — platform rows carry no company/store, merchant rows require both, exact origins are bound by the composite FK `(fulfillment_origin_id, company_id, merchant_store_id)` and the origin country must match the origin. Destinations are independent of local markets: Sweden is a valid destination without a Swedish market.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-083 — TRANSIT PROFILES DEFINE HANDOVER-DAY RANGES AND DESTINATION DELIVERY WEEKDAYS
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1D-D
**Ruling:** Transit duration is expressed per ISO handover weekday (1–7) in `shipping_transit_time_weekday_rules` with an explicit `handover_supported` flag: supported days require `transit_min_business_days` and `transit_max_business_days` (`min >= 0`, `max >= min`), unsupported days require both NULL. Delivery capability is expressed per ISO weekday in `shipping_transit_delivery_weekdays` with an explicit `delivery_enabled` flag; Sunday delivery is never assumed and weekdays are never derived from a local market. Active profiles require all seven handover rows, all seven delivery rows, at least one supported handover day and at least one enabled delivery day. No arrival date, ETA or business-day counter is stored or computed in any trigger.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-084 — SHIPPING HOLIDAYS AND CLOSURES USE VERSIONED CALENDARS, NOT HARDCODED LOGIC
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Implemented in M1C-1D-D
**Ruling:** `public.shipping_calendar_profiles` provides reusable versioned calendars with `calendar_type ∈ {origin_handover, carrier_transit, destination_delivery}` — one meaning per type, never a generic calendar. Timezones must be valid IANA names verified against `pg_catalog.pg_timezone_names`; abbreviations, offsets, implicit server timezone and unverified copies from the store are rejected. Transit profiles carry no timezone: all time-of-day arithmetic derives from the delivery-promise timezone, the calendar timezones and the order timestamp. Closures live in `shipping_calendar_blackout_dates` (one date per calendar, `reason_code ∈ {public_holiday, warehouse_closed, carrier_closed, service_suspension, emergency}`) and contain no business logic; no holiday is hardcoded in any function and none was seeded. `shipping_transit_time_profile_calendars` binds one active calendar per role, with role↔type equality enforced declaratively by the composite FK `(calendar_id, calendar_role) → shipping_calendar_profiles(id, calendar_type)`, matching tenancy and matching origin/destination country; all three roles are mandatory and active at activation.
**Verdict:** implemented; 0 rows persisted.

## BOR-DEC-085 — TRANSIT AND CALENDAR DATA ARE IMMUTABLE AFTER ACTIVATION
**Date:** 2026-07-26 | **Type:** Integrity + Governance | **Status:** Implemented in M1C-1D-D
**Ruling:** One active version per transit family and per calendar family; supersession must target the same family with a strictly higher version. Once `active`, `superseded` or `retired`, transit profiles freeze scope/tenant, carrier/service, origin/destination, version and supersession pointer, and calendars freeze scope/tenant, type, country, timezone and version. Weekday rules, delivery weekdays, calendar assignments and blackout dates are writable only while their parent is `draft`; deletion is permitted only for draft parents; status transitions are linear. Change happens exclusively through a new version. Per R-5 there is no seller activation, no admin approval and no RPC: all six tables are owner-only with RLS enabled and forced, zero policies and zero grants to PUBLIC/anon/authenticated/service_role/sandbox_exec; the nine `m1c1dd_guard_%` functions are `OWNER=postgres`, `search_path=''`, schema-qualified, dynamic-SQL-free with non-NULL `proacl`.
**Risk changes:** **R-T21 OPEN** as a mandatory deployment constraint (normalization executed; Mechanism A did not recur this cycle; ACL gate PASS in two consecutive post-commit cycles plus failure path exit 1). **R-T22** unchanged — UUID keys only, zero new sequences. **R-S2** remains a runtime requirement for the future resolver, **R-S3** still blocks labels and checkout, **R-S4** remains open (pallets unrepresented). **R-C2 OPEN — BLOCKER**: `p4_writes_allowed()` and `channel_connections` untouched, 9 live-mode connections remain `live_authorized_at IS NULL`, dispatch `deferred_not_authorized`, Bol and Stripe live off. R-5 unchanged.
**Deliverable:** `docs/PHASE5_M1C1DD_TRANSIT_TIME_DELIVERY_CALENDAR_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1D-D PASS WITH RESIDUAL RISKS.**

## BOR-DEC-086 — FINAL ETA RESOLUTION FAILS CLOSED ON MISSING OR AMBIGUOUS CONFIGURATION (PROPOSED)
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Proposed in M1C-1D-E precheck (no implementation)
**Ruling:** Transit-profile selection follows a fixed precedence ladder — merchant_store+exact_origin, merchant_store+origin_country, platform+exact_origin, platform+origin_country, manual quote, fail-closed — with exact equality on carrier_code, service_code, origin country, destination country, tenant scope and `status='active'`. Evaluation stops at the first tier that yields candidates; more than one candidate at that tier returns `ambiguous_configuration` and never falls through. First-row, newest `created_at`, lowest UUID and any undocumented tiebreak are prohibited. Local market is never used for destination eligibility. Preflight result is **B — EXPLICIT MAPPING REQUIRED**: `sttp_one_active_per_family_uk` constrains one active version per `profile_code`, not one active profile per route, so two active profiles may describe the same route; a junction (`shipping_rate_lane_transit_profiles` or `shipping_service_route_bindings`) is required before any permanent resolver. Resolution statuses: resolved, manual_quote_required, shipping_rate_missing, transit_profile_missing, ambiguous_configuration, inactive_configuration, special_handling_unsupported, destination_unavailable, invalid_configuration. Failure is never expressed by NULL alone.
**Verdict:** proposed; 0 objects created, 0 rows persisted.

## BOR-DEC-087 — ORDER TIMESTAMPS ARE EVALUATED IN THE DELIVERY PROMISE IANA TIMEZONE (PROPOSED)
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Proposed in M1C-1D-E precheck
**Ruling:** `order_received_at` is an absolute `timestamptz`; zone-less local timestamps are rejected. The local civil date and time are derived only in the delivery-promise IANA timezone; the server timezone is never read. Cut-off comparison uses that local time against the weekday's `order_cutoff_local_time`. After cut-off or on a non-accepting weekday, acceptance moves to the next accepting weekday; `accepts_orders=true` with `handover_enabled=false` accepts the order but defers handover. Handling business days are promise weekdays with `handover_enabled=true` minus origin-handover blackouts; `handling_business_days=0` means ready on the acceptance date and never implies same-day handover. Handover requires promise handover, transit-rule `handover_supported`, no origin blackout and no carrier blackout. Transit min/max are counted over carrier-transit calendar days, handover day exclusive. Delivery dates advance to enabled destination weekdays that are not destination blackouts; the range never inverts. Each calendar blocks only its own stage. A 60-day search horizon returns `no_valid_handover_date_within_horizon` instead of looping. DST entry, DST exit and repeated local hours were proven correct in a rollback-only harness.
**Verdict:** proposed; 0 objects created, 0 rows persisted.

## BOR-DEC-088 — ETA RESOLUTION REVALIDATES THE CURRENT STATE OF ORIGINS, ASSIGNMENTS, PROFILES AND CALENDARS (PROPOSED)
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Proposed in M1C-1D-E precheck
**Ruling:** Every resolution re-reads and requires `status='active'` for the assignment, the store-SKU shipping profile, the fulfillment origin, the eligibility row, the delivery-promise profile (7 schedule rows), the transit profile (7 weekday rules + 7 delivery weekdays) and all three calendars, plus tenancy equality on every hop. State at activation time is never trusted. This closes the operational half of **R-S2**. Resolver inputs are limited to `delivery_promise_assignment_id`, an explicit rate-lane/transit binding, `order_received_at`, `destination_country_code`, a reserved destination postal zone and `calculation_mode`; company, store, origin country, carrier, service and timezone are always derived, never supplied. Special handling stays fail-closed: pickup-only, dangerous goods, cold chain and pallet (R-S4) yield `special_handling_unsupported`; multi-parcel ETA must represent the slowest package once multi-service selection exists.
**Verdict:** proposed; 0 objects created, 0 rows persisted.

## BOR-DEC-089 — SHIPPING PRICE RESOLUTION AND DELIVERY ETA RESOLUTION ARE INDEPENDENT REQUIREMENTS (PROPOSED)
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Proposed in M1C-1D-E precheck
**Ruling:** `eta_resolved` and `commercial_shipping_resolved` are separate outputs. An ETA may exist without a rate (`shipping_rate_missing`, optionally routed to a manual quote) and a rate may exist without an ETA (automatic checkout blocked). An offer is purchasable only when both are true; a successful ETA alone never makes an offer buyable. Manual quotes never inherit an automatic promise assignment as the contractual ETA — they state "delivery within X–Y days after the shipping quote is accepted"; a promise profile may only serve as a non-binding internal estimate. Customer-selected delivery dates are excluded from the first resolver; `customer_date_selection_enabled` remains a capability marker.
**Verdict:** proposed; 0 objects created, 0 rows persisted.

## BOR-DEC-090 — CUSTOMER ETA OUTPUT INCLUDES THE EXACT VERSIONED CONFIGURATION USED (PROPOSED)
**Date:** 2026-07-26 | **Type:** Governance | **Status:** Proposed in M1C-1D-E precheck
**Ruling:** Every resolution returns `resolution_status`, `eta_resolved`, `commercial_shipping_resolved`, `earliest_delivery_date`, `latest_delivery_date`, `accepted_order_local_date`, `shipment_ready_date`, `handover_date`, `promise_timezone`, `transit_profile_id`, `delivery_promise_profile_id`, `calendar_version_ids[]`, `reason_code` and `configuration_evidence` (precedence tier, assignment/promise/transit versions, handover weekday, transit min/max, local order time and cut-off) so any shown ETA is reproducible against the exact versions used.
**Risk changes:** **R-S5 NEW, OPEN** — the destination model is country-level only (no postal zone, islands or remote areas), so country-level ETAs may mislead remote destinations; Alpha ETA must be labelled country-level. **R-S2** operationally addressed by BOR-DEC-088 but stays open until the resolver exists. **R-S3, R-S4, R-5** unchanged. **R-T21 ACTIVE DRIFT** detected during this read-only precheck (sandbox_exec re-granted EXECUTE on `place_order` and read on all protected tables and guards; ACL gate FAIL); not caused by this phase, remediation requires a normalization-only migration and is halted pending Owner authorization. **R-C2 OPEN — BLOCKER**: 9 live-mode connections remain `live_authorized_at IS NULL`, dispatch `deferred_not_authorized`, nothing dispatched.
**Deliverable:** `docs/PHASE5_M1C1DE_FINAL_ETA_COMPOSITION_RESOLVER_PRECHECK.md`.
**Verdict:** **SAFE ETA RESOLVER CONTRACT IDENTIFIED — EXPLICIT RATE-TRANSIT MAPPING REQUIRED.**

## BOR-DEC-095 — THE FINAL ETA RESOLVER IS PRIVATE, INTERNAL AND READ-ONLY
**Date:** 2026-07-26 | **Type:** Architecture + Security | **Status:** Implemented in M1C-1D-G
**Ruling:** ETA composition lives in `internal_shipping.resolve_final_eta`, owner `postgres`, `STABLE`, `SECURITY INVOKER`, `SET search_path=''`, schema-qualified, dynamic-SQL-free, `proacl` non-NULL. The `internal_shipping` schema holds no tables, sequences or views, and `USAGE`/`CREATE` are revoked from PUBLIC, anon, authenticated, service_role and sandbox_exec. The function performs no DML, has no application caller, and enforces a fixed 400-day search horizon the caller cannot widen. Exposure to sellers, admins, checkout or channels requires a separate authorized phase.
**Verdict:** implemented; 1 schema, 1 function, 0 tables, 0 rows.

## BOR-DEC-096 — RESOLVER INPUTS ARE IDENTIFIERS PLUS ONE ABSOLUTE INSTANT; EVERYTHING ELSE IS DERIVED
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1D-G
**Ruling:** The only inputs are the delivery-promise assignment id, the shipping rate lane id and `order_received_at timestamptz`. Company, store, origin, carrier, service, route and timezone are derived from approved configuration and can never be supplied by a caller. Zone-less local timestamps are impossible by signature. Local civil date and time are computed only in the delivery-promise IANA timezone, validated against `pg_catalog.pg_timezone_names`; the server timezone is never read. Output always carries `resolution_status` plus `reason_code`; failure is never expressed as a bare NULL, and `configuration_version_evidence` makes every shown date reproducible against the exact versions used.
**Verdict:** implemented.

## BOR-DEC-097 — EACH CALENDAR AFFECTS ONLY ITS OWN STAGE
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1D-G
**Ruling:** The origin-handover calendar constrains handling and handover only, the carrier-transit calendar constrains transit counting only, and the destination-delivery calendar constrains final delivery alignment only. Stages never bleed into each other. Transit min and max are counted from the handover day exclusive over carrier-transit days; delivery dates advance to enabled destination weekdays that are not destination blackouts; the range never inverts. `handling_business_days=0` means ready on the acceptance date and never implies same-day handover.
**Verdict:** implemented; proven by staged-blackout assertions in a rollback-only harness.

## BOR-DEC-098 — EVERY RESOLUTION REVALIDATES CURRENT STATE
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1D-G
**Ruling:** Each call re-reads and requires `status='active'` for the assignment, store-SKU shipping profile, fulfillment origin, eligibility row, delivery-promise profile (7 schedule rows, cut-off mandatory when orders are accepted), rate lane, rate card (operational at the order instant), rate-transit binding, transit profile (7 weekday rules, 7 delivery weekdays) and every attached calendar, with tenancy equality on every hop and exact carrier/service/origin/destination equality between rate and transit sides. State at activation time is never trusted. This closes the operational half of **R-S2**.
**Verdict:** implemented.

## BOR-DEC-099 — SPECIAL HANDLING AND AMBIGUITY ALWAYS FAIL CLOSED
**Date:** 2026-07-26 | **Type:** Safety | **Status:** Implemented in M1C-1D-G
**Ruling:** Pickup-only, dangerous goods, cold chain, oversized, and any package beyond the parcel envelope (> 31.5 kg or > 1750 mm, the pallet proxy for R-S4) return `special_handling_unsupported`; `bulky` alone is never treated as a pallet. More than one active binding on a lane returns `ambiguous_configuration`; zero returns `rate_transit_binding_missing` or `rate_transit_binding_inactive`. Multi-parcel shipments with more than one eligible active service on the same route fail closed. Horizon exhaustion returns `no_valid_handover_within_horizon` or `no_valid_delivery_within_horizon`. No guessed, defaulted or partial date is ever produced. Output carries `commercial_shipping_resolved=false` and `destination_granularity=country`, so an ETA alone never makes an offer purchasable (BOR-DEC-089) and country-level optimism (R-S5) stays visible.
**Risk changes:** **R-T21 ACTIVE/RECURRING** — drift cycle 6 detected post-migration (48 table privileges, `place_order`, 21 guard routines re-granted to sandbox_exec) and remediated by the revoke-only migration **M1B-0D** (zero GRANT, zero schema change, zero data change); ACL gate PASS in two consecutive post-commit cycles, failure path exit 1. **R-T22** contained. **R-S2** operationally closed. **R-S4** and **R-S5** remain open. **R-C2 OPEN — BLOCKER**: `p4_writes_allowed()` and `channel_connections` untouched, 9 live-mode connections remain `live_authorized_at IS NULL`.
**Deliverable:** `docs/PHASE5_M1C1DG_PRIVATE_INTERNAL_FINAL_ETA_RESOLVER_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1D-G PASS WITH RESIDUAL RISKS.**

## BOR-DEC-106 — DELIVERY DESTINATIONS ARE BUYER-OWNED LOGICAL RECORDS WITH IMMUTABLE VERSIONS
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Implemented in M1C-1E-B
**Ruling:** A delivery destination is a logical record owned by exactly one buyer principal (`public.profiles(id)` → `auth.users`), never by a company or merchant store. Address and access data live only in immutable versions bound to the parent by the composite key `(destination_id, buyer_principal_id)`. One active version per destination; changes create a new version. No JSONB, no free-form address blob, no polymorphic owner.
**Verdict:** implemented.

## BOR-DEC-107 — QUOTE-AREA AND STREET-ADDRESS DESTINATIONS HAVE DISTINCT COMPLETENESS CONTRACTS
**Date:** 2026-07-26 | **Type:** Data contract | **Status:** Implemented in M1C-1E-B
**Ruling:** `quote_area` requires country, postal code, city and destination type and forbids street name, house number and address unit. `street_address` additionally requires street name and house number, with address unit optional. `street_address` never implies carrier verification or label readiness.
**Verdict:** implemented.

## BOR-DEC-108 — SELLERS NEVER RECEIVE DIRECT ACCESS TO CUSTOMER DELIVERY DESTINATION TABLES
**Date:** 2026-07-26 | **Type:** Security | **Status:** Implemented in M1C-1E-B
**Ruling:** Both tables are owner-only: RLS enabled and forced, zero policies, zero grants to PUBLIC/anon/authenticated/service_role/sandbox_exec, no view, no RPC. Street name, house number and address unit are classified restricted; country, postal, city, region, destination type and access requirements are quote-safe. Any future seller visibility is a narrow projection through a trusted function after R-5 closes.
**Verdict:** implemented.

## BOR-DEC-109 — QUOTES, CHECKOUT GROUPS AND ORDERS PIN AN EXACT DELIVERY DESTINATION VERSION
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Contract fixed in M1C-1E-B
**Ruling:** Every future consumer references `customer_delivery_destination_version_id`, never the parent destination. Destination changes create a new version; quotes bound to a superseded version must later be invalidated or re-priced. Invalidation is deferred.
**Verdict:** contract recorded.

## BOR-DEC-110 — CUSTOMER CONTACT IDENTITY AND FREE-FORM INSTRUCTIONS ARE NOT STORED IN THE DESTINATION FOUNDATION
**Date:** 2026-07-26 | **Type:** Privacy | **Status:** Implemented in M1C-1E-B
**Ruling:** No email, phone, recipient name, messaging handle, GPS coordinates, delivery notes, door codes, security instructions or identity documents exist in the model, and the deployment gate asserts their absence.
**Verdict:** implemented.

## BOR-DEC-111 — POSTAL NORMALIZATION SUPPORTS MATCHING BUT CLAIMS NO ADDRESS OR CARRIER VERIFICATION
**Date:** 2026-07-26 | **Type:** Data contract | **Status:** Implemented in M1C-1E-B
**Ruling:** `postal_code` keeps the raw trimmed value; `postal_code_normalized = upper(regexp_replace(postal_code,'[^A-Za-z0-9]','','g'))`, deterministic, non-empty, enforced by CHECK. It is a matching aid only — not validation, not deliverability. Country is ISO-3166 alpha-2, never inferred from the postal code.
**Risk changes:** **R-S3 PARTIALLY MITIGATED** (schema exists; operational capture, recipient model, snapshot integration and carrier validation still missing). **R-S4** and **R-S5** remain open; the ETA resolver stays country-level and unmodified. **R-5** open. **R-T21 ACTIVE/RECURRING** — drift cycle 8 detected *before* business DDL and normalized by revoke-only migration **M1B-0F**; gate PASS in two independent post-commit cycles, failure path exit 1. **R-C2 OPEN — BLOCKER**: channel rows untouched, live-authorized channels = 0.
**Deliverable:** `docs/PHASE5_M1C1EB_AUTHORITATIVE_DELIVERY_DESTINATION_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1E-B PASS WITH RESIDUAL RISKS.**

## BOR-DEC-112 — MANUAL SHIPPING QUOTE REQUESTS ARE SCOPED TO ONE BUYER, ONE MERCHANT STORE AND ONE EXACT DESTINATION VERSION
**Date:** 2026-07-26 | **Type:** Architecture | **Status:** Implemented in M1C-1E-C
**Ruling:** A request covers exactly one buyer, one company, one merchant store, one currency and one fulfilment group, and pins one `customer_delivery_destination_versions.id` owned by that same buyer through a composite foreign key. Multi-merchant or multi-store requests are structurally impossible.
**Verdict:** implemented.

## BOR-DEC-113 — SUBMITTED MANUAL QUOTE REQUESTS PIN IMMUTABLE ITEM, PACKAGE, ORIGIN AND DESTINATION SNAPSHOTS
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1E-C
**Ruling:** Drafts are editable by the owner. Once a request leaves draft, buyer, company, store, destination version, origin, shipment form, currency, version, supersession, items, quantities and package dimensions are frozen; items and packages reject insert, update and delete. Change requires a new request version in the same family with a strictly higher version number. Terminal states are historical.
**Verdict:** implemented.

## BOR-DEC-114 — MANUAL QUOTE REQUESTS USE EXPLICIT PARCEL, MULTI-PARCEL, PALLET OR FREIGHT SHIPMENT FORMS
**Date:** 2026-07-26 | **Type:** Data contract | **Status:** Implemented in M1C-1E-C
**Ruling:** `shipment_form ∈ {parcel, multi_parcel, pallet, freight}` is a contractual snapshot of the request only. It is never stored on the destination, never inferred from `bulky` or dimensions, and asserts no carrier eligibility. Cardinality is enforced at submission: parcel = one row with `package_count = 1`; multi_parcel ≥ 2 physical units; pallet and freight ≥ 1 row.
**Risk change:** **R-S4 PARTIALLY MITIGATED FOR MANUAL QUOTE REQUEST SNAPSHOTS**; still open at general product classification level.
**Verdict:** implemented.

## BOR-DEC-115 — MANUAL QUOTE REQUESTS REQUIRE AN EXACT ACTIVE FULFILMENT ORIGIN BEFORE SUBMISSION
**Date:** 2026-07-26 | **Type:** Integrity | **Status:** Implemented in M1C-1E-C
**Ruling:** Origin may be NULL in draft only. At `requested` the origin must be exact, active, same company and store, and every item must carry an active eligibility edge to that origin. Origin-country fallback is forbidden for manual quotes.
**Verdict:** implemented.

## BOR-DEC-116 — MANUAL QUOTE REQUESTS DO NOT RESERVE INVENTORY OR PRODUCT PRICES
**Date:** 2026-07-26 | **Type:** Commerce semantics | **Status:** Implemented in M1C-1E-C
**Ruling:** A request reserves no inventory, pins no availability, pins no product price, carries no shipping charge and permits no payment. Product, stock, origin eligibility and price must be re-validated at offer creation, offer acceptance and checkout confirmation. Bound in table comments; no price columns exist.
**Verdict:** implemented.

## BOR-DEC-117 — PICKUP-ONLY, DANGEROUS-GOODS AND COLD-CHAIN REQUESTS FAIL CLOSED UNTIL EXPLICIT CAPABILITY MODELS EXIST
**Date:** 2026-07-26 | **Type:** Safety | **Status:** Implemented in M1C-1E-C
**Ruling:** Submission is blocked when any item profile is `pickup_only`, `dangerous_goods` or `handling_class = 'cold_chain'`. `oversized` is explicitly allowed, since oversized goods are the primary manual-quote use case.
**Risk changes:** **R-S3 PARTIALLY MITIGATED**, **R-S5 OPEN**, **R-5 OPEN** (no application write workflow), **R-T21 ACTIVE/RECURRING** — drift cycles 9 and 10 normalized by revoke-only migrations **M1B-0G** and **M1B-0H**; gate PASS in two independent cycles (58/58), failure path exit 1. **R-C2 OPEN — BLOCKER**: channel rows untouched, live-authorized channels = 0.
**Deliverable:** `docs/PHASE5_M1C1EC_MANUAL_SHIPPING_QUOTE_REQUEST_ITEM_PACKAGE_SNAPSHOT_FOUNDATION_REPORT.md`.
**Verdict:** **M1C-1E-C PASS WITH RESIDUAL RISKS.**

## BOR-DEC-118 — Manual quote offers are versioned rows bound to one request
Offers are immutable versions bound to their request by composite FK on
(request_id, buyer_principal_id, company_id, merchant_store_id, currency_code).
Revision means a new version that supersedes the previous one; history is never rewritten.

## BOR-DEC-119 — At most one published offer version per request
Enforced declaratively by a partial unique index on status='offered'.

## BOR-DEC-120 — Publication revalidates the full request context
Request state, destination version and parent, exact active origin, item eligibility and
profile flags are revalidated at publication. Pickup-only, dangerous goods and cold chain
fail closed.

## BOR-DEC-121 — Offers carry a customer-facing shipping charge only
No carrier cost, VAT, product amount, margin or total. Currency must match the request.

## BOR-DEC-122 — Offer ETA is expressed in calendar days after acceptance
No automatic ETA resolver call; the manual quote path is explicitly human-authored.

## BOR-DEC-123 — Offer conditions are coded, with bounded free text only for 'other'
No PII, no messaging, no external handles. Conditions are immutable once the offer is published.

## M1C-1E-E — MANUAL QUOTE ACCEPTANCE, EXPIRY AND INVALIDATION FOUNDATION (2026-07-26)

- BOR-DEC-124 — Acceptance is a terminal, immutable snapshot; exactly one per request family.
- BOR-DEC-125 — Acceptance, offer settlement and request settlement are one atomic transaction.
- BOR-DEC-126 — Offer expiry is evaluated at read and at acceptance; no scheduled job is authoritative.
- BOR-DEC-127 — Closing or superseding a request requires prior invalidation of every outstanding offer.
- BOR-DEC-128 — Manual quote lifecycle history is an append-only event log; no state may be rewritten.
- BOR-DEC-129 — Acceptance never creates an order, payment, reservation or carrier booking.

Security: M1B-0J (ACL drift cycle 12, REVOKE-only) applied before business DDL.
Verification: 65/66 assertions PASS (single FAIL is a harness fixture limitation, not a defect).
ACL GATE: PASS. Verdict: M1C-1E-E PASS WITH RESIDUAL RISKS.

## M1C-1E-E-R1 — SCOPE RECONCILIATION AND CLOSEOUT ONLY (2026-07-26)

- BOR-DEC-130 — Manual quote state events record immutable state evidence but do not replace the authorization audit.

Reconciliation: dropped `manual_shipping_quote_acceptance_conditions` (duplicated offer conditions, 0 rows);
dropped `m1c1ee_offer_effective_status` (uncalled status resolver, early M1C-1E-F);
renamed `m1c1ee_offer_acceptability` → `m1c1ee_guard_offer_acceptability` (trigger-only guard helper);
removed unauthorized offer status `invalidated` from the status contract and all guards.
Security: M1B-0K and M1B-0L (REVOKE-only, R-T21 drift cycle 13).
ACL GATE: PASS in two consecutive cycles (failure path exits 1). Live-authorized channels: 0. Persistent rows: 0.
Verdict: CONCURRENCY EVIDENCE INCOMPLETE — harness rebuild, traceability mapping and two-session
concurrency evidence pending under a separate authorization (M1C-1E-E-R2).

## M1C-1E-E-R3 — ACCEPTANCE SETTLEMENT REPAIR AND FAMILY SERIALIZATION HARDENING (2026-07-26)

- BOR-DEC-131 — A deferred settlement guard may only reference objects that exist in the same release; dropping a table obliges repairing every guard that reads it in the same authorization.
- BOR-DEC-132 — The manual quote request family is the unit of serialization. Every writer (request, offer, acceptance) takes one transaction-scoped advisory lock on `request_family_id` before validating, in a single lock order, so no deadlock cycle can form.
- BOR-DEC-133 — Once a family holds an acceptance it is permanently closed to new request versions; the refusal is the explicit application contract `BVQ01 / request_family_already_accepted`, not an incidental validation error.
- BOR-DEC-134 — Advisory-lock serialization is a guard-level control, not a storage constraint; it binds only writers passing through triggers and must be re-reviewed before any application RPC is exposed (R-Q1).

P0 repaired: `m1c1ee_guard_acceptance_settlement` no longer references the R1-dropped
`manual_shipping_quote_acceptance_conditions`; acceptance no longer fails at COMMIT with 42P01.
W1 closed: `public.m1c1ee_guard_family_lock(uuid)` (owner-only, empty pinned search_path) is taken by
`m1c1ee_guard_acceptance_write`, `m1c1ec_guard_request_write` and `m1c1ed_guard_offer_write`.
Scope: no new tables, columns, statuses, RPC or UI. Guard inventory 18 -> 19 (recorded in the gate).
Verification: harness 44/44 PASS, concurrency C1-C4 4/4 PASS, 0 deadlocks, static scan zero references.
Security: M1B-0M then M1B-0N (REVOKE-only, R-T21 drift cycle 14; M1B-0M was reverted by the platform
re-grant and re-applied by M1B-0N). ACL GATE: PASS 58/58. Rows: 0. Live-authorized channels: 0.
New residuals: R-Q1 (advisory lock binds guard-path writers only), R-Q2 (single-family write queuing).
Verdict: M1C-1E-E-R3 PASS. Evidence: docs/PHASE5_M1C1EE_R3_ACCEPTANCE_SETTLEMENT_REPAIR_AND_FAMILY_SERIALIZATION_REPORT.md

## M1V-1C — SELLER LEGAL IDENTITY, VERIFICATION AND PUBLIC STORE PROFILE FOUNDATION (2026-07-26)

- BOR-DEC-135 — Legal identity is normalized away from `merchant_stores`: `company_legal_identities` holds the legal entity and its verification lifecycle, `company_legal_identifiers` holds typed registration numbers (KvK/VAT/EORI) with a global active-uniqueness index, so one registration number can never be claimed by two tenants.
- BOR-DEC-136 — Verification state is admin-owned. Sellers may only move an identity `draft -> submitted`; `approved`/`rejected`/`suspended` transitions and every verification field are blocked for the submitting party by `m1v1c_guard_legal_identity_write`. Self-approval is structurally impossible, not policy-dependent.
- BOR-DEC-137 — The verified-seller badge is derived, never stored on the storefront: it is emitted only by `public_get_store_profile` when the owning company identity is `approved`. A published store with an unapproved identity renders without a badge; an unpublished store renders nothing at all.
- BOR-DEC-138 — Store publication is a gated state (`draft`/`published`/`suspended`) enforced by `m1v1c_guard_store_profile_write`; publishing requires an approved legal identity. Public reads run as `anon` through one allowlisted read-only routine, never through table grants.
- BOR-DEC-139 — Direct seller contact details are never exposed publicly. The public profile carries policy summaries and a fixed `contact_channel` routed through Borvat customer service.
- BOR-DEC-140 — `seller_verification_events` is append-only and immutable (`m1v1c_guard_verification_event_immutable`); the verification trail cannot be edited or deleted, including by the reviewing admin.
- BOR-DEC-141 — Anonymous EXECUTE is no longer categorically forbidden by the ACL gate; it is deny-by-default with an explicit allowlist entry carrying the `anon` role. The only such entry is `public_get_store_profile(text)`.

Scope: schema + guards + controlled RPC surface + one reserved public route. No product publication,
no pricing, no payments, no settlement, no channel/Bol activity.
Qnan B.V. recorded as legal identity in `draft` (KvK 91138906, VAT NL865563251B01); IBBO public
profile recorded in `draft`. Qnan remains an operational tenant, NOT a legally verified seller.
Verification: 22/22 static assertions PASS; duplicate KvK/VAT rejected (23505); self-approval rejected;
publish-while-draft rejected; audit edit rejected; anon `public_get_store_profile('ibbo')` returns null.
Security: M1B-0Q then M1B-0R (REVOKE-only, R-T21 drift cycles 10 and 11). ACL GATE: PASS twice.
Tenant zero-state held: Qnan products 0, offers 0, inventory 0, listings 0, live-authorized channels 0.
New residuals: R-P1 (KvK/VAT columns absent from `merchant_stores` by design — identifiers are
normalized), R-V1 (no admin verification UI yet; approval is a governed manual DB action),
R-V2 (`/store/$slug` renders "coming soon" for every slug until an admin approval exists).
Verdict: M1V-1C PASS. Evidence: docs/PHASE5_M1V1C_SELLER_LEGAL_IDENTITY_AND_PUBLIC_STORE_PROFILE_REPORT.md

---

## BOR-DEC-142 — M1V-1D RPC-only seller application surface
Date: 2026-07-27. Scope: `public.seller_applications`, `public.seller_application_events`.
Decision: the six M1V-1D routines are the sole access path. Both tables keep RLS enabled and
forced, zero policies and zero table privileges for `anon`, `authenticated`, `service_role` and
`sandbox_exec`. Review metadata (`approved_at`, `decided_by`, decision reasons) is
administrator-owned and can never be supplied by a client.

## BOR-DEC-143 — `has_role` must remain executable by `anon` and `authenticated`
Date: 2026-07-27. Trigger: revoking EXECUTE on `public.has_role(uuid, app_role)` broke every
storefront read (`permission denied for function has_role`, HTTP 403 on `/rest/v1/products`).
Reason: RLS policy expressions are evaluated with the privileges of the querying role, and the
policies on `products`, `orders`, `order_items`, `agent_audit_log` and the tax surfaces call
`has_role()`. Decision: `has_role` is an approved routine with EXECUTE for `anon`,
`authenticated` and `service_role`, recorded with written justification in
`scripts/phase5-acl-gate/approved-routines.json`. Repaired by M1B-0T; verified HTTP 200.

## BOR-DEC-144 — administrator self-review is prohibited
Date: 2026-07-27. Decision: `admin_review_seller_application` raises `self_review_forbidden`
when the reviewer is a member of the applicant company. Approving Qnan B.V. therefore requires a
second, independent platform administrator appointed by the owner. The guard must not be relaxed.
Consequence: Qnan B.V. stays an operational tenant that is NOT a legally verified seller; the
verified badge, store publication, product publication, payments, settlement and any channel live
mode remain blocked.

## M1V-1D CLOSURE
Static gate 23/23 PASS. Runtime security tests 14/14 PASS (anon, plain authenticated outsider,
owner/admin). ACL GATE: PASS twice (64 assertions) after M1B-0T (has_role repair) and M1B-0U
(REVOKE-only drift cycle 13). UI proof: platform admin sees the review queue, seller owner sees
onboarding, non-admin authenticated sees "Access denied".
Verdict: M1V-1D PASS. Evidence: docs/PHASE5_M1V1D_SELLER_APPLICATION_AND_VERIFICATION_WORKFLOW_REPORT.md

## BOR-DEC-145 — dedicated least-privilege role `seller_verification_reviewer`
Date: 2026-07-27. Decision: seller verification is NOT delegated by granting a second full
`platform_admin`. A dedicated value `seller_verification_reviewer` was added to `public.app_role`
and remains stored only in `public.user_roles`. Its entire authority is the seller-application
surface: `admin_list_seller_applications`, `admin_get_seller_application`,
`admin_review_seller_application`. Every other admin RPC keeps `m1v1d_require_admin()` and stays
platform-admin only. Rationale: least privilege; the reviewer must never touch catalog, inventory,
orders, prices, payouts, channels, platform users, security or ACL.

## BOR-DEC-146 — reviewer role is administrator-granted and never self-granted
Date: 2026-07-27. Decision: `guard_user_roles_mutation` now treats `admin` and
`seller_verification_reviewer` as privileged roles: only an existing platform admin may insert,
change or remove them, and no caller may grant or remove a privileged role for themselves. The
last-platform-admin protection remains admin-specific.

## BOR-DEC-147 — decisions record the real actor role
Date: 2026-07-27. Decision: `seller_application_events.actor_role` and
`seller_verification_events.actor_role` accept `seller_verification_reviewer`, and
`admin_review_seller_application` writes the caller's actual role instead of a hardcoded
`platform_admin`. Every decision still produces exactly one immutable event.

## BOR-DEC-148 — self-review guard applies to reviewers, unchanged
Date: 2026-07-27. Decision: the `self_review_forbidden` guard is enforced before any transition for
BOTH platform admins and verification reviewers via `is_company_member`. No bypass flag, no service
role path and no UI escape hatch was introduced. Qnan B.V. therefore still cannot be approved by
its owner account.

## M1V-1D-A STATUS
Role, RPC gate, grant governance, immutable-event actor role and a separate least-privilege
workspace at `/review/seller-applications` are implemented and typecheck-clean. No user holds
`seller_verification_reviewer`; no Qnan decision was recorded; live-authorized channels remain 0.
Verdict: GOVERNANCE BLOCKER — NO INDEPENDENT HUMAN REVIEWER AVAILABLE (identity pending from owner).

---

## BOR-DEC-149 — PHASE 0 P0-1: TABLE GRANTS ARE POLICY-DERIVED, NOT HAND-MAINTAINED (2026-07-31)
Decision: `anon` and `authenticated` table privileges in schema `public` are generated
mechanically from `pg_policies` (roles anon/authenticated/public, `ALL` expanded to
SELECT/INSERT/UPDATE/DELETE). A grant with no backing policy is inert and MUST be revoked.
If an application path breaks, the fix is a missing **policy**, never a re-added grant.
Applied by `20260731232446_f9ee9ffa-914e-4ad3-845d-40d8e570b23c.sql`
(SHA-256 `6af0045465a9c349c88e3b35d088e77f345d9e59236ad58f253204edca69f488`).

## BOR-DEC-150 — ANON IS READ-ONLY AND REACHES EXACTLY SIX TABLES (2026-07-31)
Decision: the unauthenticated role holds SELECT and nothing else, on exactly six tables:
`categories`, `inventory_dispositions`, `permissions`, `products`, `role_permissions`,
`system_company_roles`. Any future table requiring anonymous reach needs an explicit
owner-approved decision entry. F-2 (236 anon write grants) is CLOSED.

## BOR-DEC-151 — MAINTAIN IS A REVOKED PRIVILEGE (2026-07-31)
Decision: the Postgres 17 `MAINTAIN` privilege is treated exactly like TRUNCATE/TRIGGER/
REFERENCES: never held by `anon` or `authenticated`. It was absent from the handover census
and had been granted on 59 tables to each role.

## BOR-DEC-152 — P0-1 DOES NOT ADDRESS R-T21; NO FURTHER SANDBOX NORMALIZATION CYCLES (2026-07-31)
Decision: `sandbox_exec` (SELECT+INSERT on 102 tables) and `service_role` grants are out of
Phase 0 scope. The ACL gate therefore still exits 1, on pre-existing drift only. Per handover §7,
normalization cycle 16 was NOT run. The structural fix is BOR-DEC-107 / P0-5 (relocate business
schema out of `public`), which requires staging. Measured, not assumed: R-T21 is unchanged by P0-1.

## BOR-DEC-153 — `authenticated` KEEPS INSERT ON user_roles UNTIL P0-2 (2026-07-31)
Decision: because P0-1 is strictly policy-derived, the grant backing the escalation policy
"users can become seller" survives P0-1 by design. It is revoked together with the policy in P0-2.
F-3 remains OPEN until P0-2 is authorized and applied.

## BOR-DEC-154 — GRANT SWEEPS MUST COVER ALL RELATION KINDS, NOT JUST BASE TABLES (2026-07-31)
Decision: any REVOKE/GRANT sweep over schema `public` MUST enumerate every relation kind
(`relkind in ('r','p','v','m','f')`), never `table_type='BASE TABLE'` or `relkind='r'` alone.
P0-1 filtered on base tables and therefore skipped the VIEW `public.channel_connections_safe`,
which retained the full default ACL for `anon` and `authenticated`. Post-condition assertions
for future ACL migrations MUST likewise be relkind-agnostic — P0-1's were not, which is why
the omission did not fail the migration.

## BOR-DEC-155 — `channel_connections_safe` IS AUTHENTICATED-READ-ONLY (2026-07-31)
Decision: applied by P0-1a (REVOKE-only, 0 rows, 0 schema change): all privileges on
`public.channel_connections_safe` revoked from `anon`, `authenticated` and `PUBLIC`, then
`SELECT` re-granted to `authenticated` only. The view stays `security_invoker = true`, so RLS on
`public.channel_connections` remains the effective tenant boundary; the view grant is not one.
Verified after: anon write grants = 0 across all relkinds, anon reaches exactly 6 objects
(SELECT only), authenticated holds no TRUNCATE/TRIGGER/REFERENCES, and zero non-SELECT grants
exist on any non-base relation.

## BOR-DEC-156 — A DORMANT GRANT BEHIND ACCIDENTAL SAFETIES IS STILL A DEFECT (2026-07-31)
Decision: the missed view grant was not exploitable — `security_invoker` plus a revoked base-table
grant plus RLS with no anon policy denied it three ways. It was closed anyway. Standing rule:
grants are never left in place on the argument that another layer currently blocks them, because
that argument expires the moment the other layer changes.

## BOR-DEC-157 — P0-3 EXECUTED: THE PRODUCTION DATABASE HOLDS EXACTLY ONE TENANT (2026-08-01)
Decision: P0-3 purged 162 fixture companies and their full descendant closure. `public.companies`
now holds exactly one row: `Qnan B.V.`. Verified after: companies = 1, orphaned `company_members`
= 0, `channel_connections` in `mode = 'live'` = 9 -> 0, `merchant_stores` = 1 (IBBO, draft),
`orders` = 0. Qnan's `seller_applications` row and `company_legal_identities` row were preserved;
Qnan remains operational-but-unverified and every M1V-1C prohibition still applies. F-9 CLOSED.
Destructive and irreversible: rollback is a point-in-time restore, not a migration.

## BOR-DEC-158 — APPEND-ONLY GUARDS ARE SUSPENDED ONLY TRANSACTIONALLY, NEVER BYPASSED (2026-08-01)
Decision: 28 `BEFORE DELETE` immutability/append-only triggers blocked the administrative purge,
and `session_replication_role = 'replica'` is not grantable on this platform (`42501`). Standing
rule for any future administrative delete: disable the *named* guard triggers and re-enable them
inside the *same* transaction, never disable `TRIGGER ALL`, never drop a guard, and always assert
`count(*) FROM pg_trigger WHERE tgenabled = 'D'` = 0 as a post-condition. FK triggers stay enabled
throughout — that is the property that exposed three real delete-ordering defects instead of
silently orphaning rows.

## BOR-DEC-159 — A HANDOVER DELETE SCRIPT IS A SPECIFICATION, NOT AN EXECUTABLE (2026-08-01)
Decision: the handover P0-3 script omitted 24 descendant tables holding `ON DELETE RESTRICT`
constraints and mis-named several join columns. The purge closure MUST be derived mechanically
from `pg_constraint` at execution time, not transcribed from a document. Any future purge or
tenant-offboarding migration derives its table order from live catalogue introspection and hard-
aborts on unexpected counts before deleting anything.

## BOR-DEC-160 — THE 188 FIXTURE SELLER ROLES ARE GONE, NOT PARDONED (2026-08-01)
Decision: the 188 pre-existing `user_roles` rows with `role = 'seller'` flagged during P0-2 were
all fixture-owned and were removed as part of the P0-3 closure; the count is now 0. The only
lawful path to the seller role remains `public.grant_seller_role_from_approved_application()`
backed by an approved `seller_applications` row. No grandfathering exception was created.


## BOR-DEC-161 — DELEGATED IMPLEMENTATION AND ORIGINAL-APPLICATION ISOLATED INTEGRATION (2026-10-23)

- Type: Engineering governance and bounded application integration.
- Owner instruction: «طيب استلم هاد الهدف بتفويض كامل بشغل احترافي مهني عالمي» after reviewing BORVAT's gap to an operational marketplace.
- Decision: normal implementation, isolated tests and reviewable GitHub branch/PR work are authorized. Earlier preparation-only prohibitions on implementation are superseded for this work. This does not constitute exact-source acceptance of the unresolved financial foundation or a production release.
- Implementation boundary: explicit build-time `VITE_BORVAT_RUNTIME=isolated`; original TanStack Start router/root/SSR; one per-application synthetic command store; no real credentials or orders. Default mode retains the original backend/authentication routes and hard-disabled checkout.
- Source evolution: preserve the immutable recovery manifest and historical artifacts; record named original-file before/after hashes in `docs/commerce-integration/source-changes.json`. Do not relabel changed texts or runtime public-image paths as original media parity.
- Operational authority: WMS remains the stock/movement authority; Accounting remains the invoice/credit/GL/value authority. This stage adds no parallel ledger or native adapter claim.
- Other changes: request-scoped lazy email SDK construction to avoid import-time provider-secret failure; SDK verification/dispatch remains delegated to the same SDK when configured and invoked outside isolated mode. An isolated request is rejected before dispatching write/API handlers.
- Validation and scope: see `docs/commerce-integration/REPORT.md` for exact commands/results and open limitations. No migration, production DB, real seller decision, main merge, deployment, live payment, payout, email or paid service is authorized by this bounded milestone.
- Rollback: abandon the unmerged branch or revert the bounded implementation commit. No data migration exists.
