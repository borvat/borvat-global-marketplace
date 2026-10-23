# BORVAT CURRENT STATE V1

**Current engineering update — 2026-10-23:** The owner delegated implementation of marketplace completion. The original application now has an explicit isolated commerce runtime and real TanStack routing boundary; its full build, SSR/browser and regression evidence are recorded in [the current integration report](../../../docs/commerce-integration/REPORT.md). This update does not certify native checkout, payments, WMS/Accounting integration, original media, seller verification or release readiness. The historical entries below remain evidence for their original dates.

**آخر تحديث:** 26 يوليو 2026 (بعد M1B-2B — BOR-DEC-046 + BOR-DEC-047)
**الغرض:** سجل تنفيذي حي. يُحدّث بعد كل مرحلة أو Hotfix أو قرار إطلاق.
**المرجع الأعلى:** `BORVAT_MASTER_BLUEPRINT_V1.md`

## 0. آخر تغييرات (2026-07-26)

- **M1B-2B PASS WITH RESIDUAL RISKS** (`BOR-DEC-046` + `BOR-DEC-047`) — Tax
  Foundation Schema and Read-Only Baseline. Additive-only. Installed
  `btree_gist 1.7` in the `extensions` schema (0 objects in `public`).
  Created 4 tables in `public`: `tax_categories` (4 canonical label rows —
  standard/reduced/zero/exempt), `tax_rate_versions` (country×category×
  effective window, lifecycle draft/approved/superseded/withdrawn),
  `catalog_product_tax_classifications` (product×destination×effective
  window, lifecycle proposed/approved/superseded/withdrawn),
  `company_tax_profiles` (per-Company VAT identity, unverified by default).
  Two real exclusion constraints (`tax_rate_versions_no_active_overlap`,
  `cptc_no_active_overlap`) using `daterange(valid_from, valid_to, '[)')` +
  `btree_gist` equality on the scalar keys — no trigger substitute. RLS
  ENABLE+FORCE on all four; `authenticated` = admin-only reads on rate
  versions and product classifications, company-scoped reads on tax
  profiles; `anon`/`sandbox_exec` = none. Zero real VAT rates, zero
  approved classifications, zero VAT identities persisted. 13 behavioural +
  3 post-cleanup tests all PASS inside a rolled-back subtransaction
  (overlap rejected `23P01`, drafts do not conflict, diff-category/diff-
  country accepted, CHECK constraints reject bad country code / invalid
  range / approved-without-approver / negative rate / vat-pair violation /
  verified-without-verifier). Test suite was created SECURITY DEFINER,
  executed, force-rolled-back, and the test function dropped — 0 residual
  objects, 0 residual rows. Invariants preserved: P5-HF-001 intact; Bol
  Live rows with `live_authorized_at` = 0; Stripe Live disabled; no
  `channel_listings` / `borvat_direct_listing_publications` /
  `channel_accounts` / `merchant_stores` row modified; pre-existing 42
  SECURITY DEFINER linter warnings unchanged (no new SECURITY DEFINER
  function persisted). Files: `supabase/migrations/20260726093908_70ac2449-
  599a-4444-b350-4ff5d05feee5.sql` (`7a692224…3091e0`), `supabase/
  migrations/20260726094140_2dfdf99b-f8ba-4294-befc-9d9b2bb7005d.sql`
  (`0f967165…30c885`). Deliverable: `docs/PHASE5_M1B2B_TAX_FOUNDATION_
  IMPLEMENTATION_REPORT.md`. Residual risks added: R-T1..R-T6 (see report).
  **STILL BLOCKED:** Pricing (M1B-3), Shipping (M1B-4), Tax approval
  workflows, Publication activation, Public Storefront, checkout
  re-enable, Bol Live, Stripe Live, M2–M10.



- **M1A MIGRATION #1 PASS WITH RESIDUAL RISKS** (`BOR-DEC-031`) — Merchant
  Stores Foundation. Additive-only: created `public.merchant_stores`
  (23 cols, FK companies ON DELETE RESTRICT; slug/status/currency/country/
  locale/email/JSON CHECKs), 6 indexes (global unique slug, one-primary-per-
  company partial unique, idempotency partial unique), RLS+FORCE with a
  single SELECT policy `is_company_member(company_id, auth.uid())`,
  `trg_merchant_stores_updated_at`, and 3 SECURITY DEFINER RPCs owned by
  `postgres` with `search_path=''`: `_merchant_store_can_manage`,
  `create_merchant_store` (idempotency-key-safe, owner-or-admin gated, no
  mass-assignment, server-side slug regex, zero hardcoded IDs),
  `update_merchant_store_profile` (identity/branding only — company_id/slug/
  status immutable through this RPC). Grants hardened: `anon`=none;
  `authenticated`=SELECT only + EXECUTE on the 3 RPCs; `service_role`=
  ALL/EXECUTE; PUBLIC=none. Platform-default `pg_default_acl` grants to
  `anon`/`authenticated` explicitly REVOKED. 17 tests inside `BEGIN…ROLLBACK`
  all PASS (structural + JWT-claims-simulated behavioural): non-member
  update denial (42501), owner idempotency, 7th-company portability with
  zero code/schema change, no-secret-plaintext in audit rows. Baseline
  invariants unchanged: `place_order` EXECUTE limited to `postgres`+
  `sandbox_exec` (P5-HF-001 intact); Bol Live rows with `live_authorized_at`
  = 0; 62/62 public tables RLS-enabled. `sandbox_exec` reviewed and
  documented: not superuser, `BYPASSRLS`, only `postgres` is a member; no
  JWT-facing role inherits it; not reachable from any application code
  path; retained EXECUTE on new RPCs is a `pg_default_acl` artefact — not
  a SECURITY BLOCKER, not modified. Files: `supabase/migrations/
  20260724221616_ca682252-4df7-41a0-bd5e-d6fd877ed780.sql`
  (`bf90d77f…4c49b2`), `…221718_87e3f3c9-….sql` (`a1734bc9…1a6258`),
  `…221925_cf3f8ced-….sql` (`8100d8c6…4c758c`). Deliverable:
  `docs/PHASE5_M1A_M1_MERCHANT_STORES_REPORT.md`. **BLOCKED after
  Migration #1**: any M1A Migration #2+, `borvat_direct` channel_accounts,
  listings, product cutover, `products`/`catalog_*` mutation, orders,
  checkout re-enable, Stripe integration, tax, shipping, inventory
  changes, reservations, comms outbox, Bol Live, Stripe Live, M2–M10.



- **LOVABLE-NATIVE VERIFICATION PASS WITH RESIDUAL RISKS** (`BOR-DEC-030`).
  Owner approved OPTION C: in-Lovable static + live-read-only audit replaces
  clean-room replay as the interim M0 baseline. Diff over 61 live tables /
  101 functions / 114 policies / 80 triggers / 2,031 table-ACL rows / 408
  function-ACL rows vs. static parse of 37 migrations produced **0 DANGEROUS,
  0 UNDOCUMENTED, 2 EXPECTED DIFFERENCE** (both benign and root-caused —
  `channel_connections_safe` view; `mark_bol_order_line_shipped` created-then-
  dropped). Critical invariants verified live and read-only: `place_order`
  EXECUTE limited to `postgres`+`sandbox_exec` (P5-HF-001 intact); Bol Live
  disabled (0 rows with `channel_connections.live_authorized_at`); Stripe Live
  disabled; 61/61 tables have RLS enabled; audit log columns carry no secret
  plaintext. Eight residual-risk classes explicitly recorded as NOT provable
  without replay (idempotency, concurrency, deadlocks, kill-switch write
  precedence, double-dispatch race, replay-from-zero, anon default DML grants
  gated only by RLS, `supabase_migrations.schema_migrations` unreadable from
  audit role). GitHub CI Harness is **FROZEN — FUTURE INDEPENDENT VERIFICATION
  ASSET** and does not block progress. Deliverables:
  `docs/PHASE5_M0_LOVABLE_NATIVE_VERIFICATION_REPORT.md`,
  `docs/phase5-m0/live-schema-inventory.json`,
  `docs/phase5-m0/static-migration-model.json`,
  `docs/phase5-m0/lovable-native-diff.md`. Verdict authorises **M1A —
  Merchant Store Foundation** (additive-only, per-migration stop-for-report).
  M2–M10 / Bol Live / Stripe Live / checkout re-enable / product cutover /
  tax / shipping / comms outbox remain BLOCKED.

- **M0-E3 CI Harness patched — FROZEN** (`BOR-DEC-029`,
  supersedes the harness contents of `BOR-DEC-028`). Static review v2 clean:
  0 Critical / 0 High / 2 documented-ACCEPTED Medium. Delivered: three pinned
  manifests (`scripts/phase5-m0/manifests/{pre-hotfix,current,m4-checkpoint}-manifest.json`)
  with per-entry `sha256`+`size_bytes`+`execution_order`; `run-cleanroom.sh`
  now integrity-verifies the manifest before applying a single SQL line and
  rejects any UNDECLARED migration for the `current` set; new
  `verify-live-readonly-role.sh` proves 7 read-only invariants on the Job D
  DSN before `pg_dump` (attributes, ownership, membership recursion,
  `default_transaction_read_only`, no CREATE, no writes, no sensitive
  RPC EXECUTE — all via `has_*_privilege` / `pg_roles`, no INSERT probe on
  Production); new `assert-empty-db.sh`, `scan-artifacts-for-secrets.sh`
  (16 secret categories, redacted output), and `write-run-metadata.sh`
  (GITHUB_SHA/RUN_ID/RUN_ATTEMPT/REF + workflow SHA + 3 manifest SHAs + tool
  versions); real `phase4-m4-post-m5-compat-tests.ts` (7 invariants inside a
  SAVEPOINT rollback, no Bol call) plus new `phase4-m4-checkpoint-tests.ts`
  and `run-m4-checkpoint.sh` (Job C2, dedicated `cleanroom_m4` service
  container, 29-migration manifest ending BEFORE `20260724003715` where
  `live_authorized_at` is introduced); `generate-gate-report.ts` now emits
  the required 10-step verdict ladder; workflow declares
  `permissions: { contents: read }` and env `PHASE5_CLEANROOM=true`, Job D
  gated on `workflow_dispatch` AND environment `phase5-m0-live-readonly`.
  `run-baseline-suites.sh` no longer emits `PRE-EXISTING FAILURE` — the two
  historical M4 suites now run only in Job C2 against the M4 checkpoint DB.
  Baseline verdict remains **BASELINE FAIL — WORKFLOW NOT YET EXECUTED**
  until a GitHub-Actions run completes and its Gate Report is reviewed.


- **P5-HF-001 ACCEPTED AND CLOSED** (`BOR-DEC-023`). `EXECUTE` denied to
  `anon`/`authenticated`/`service_role`; function retained under owner with
  deprecation COMMENT; `/checkout` server-rendered offline; no
  `rpc('place_order', …)` call remains in the client bundle; no-regrant
  rollback rule enforced. Migration
  `supabase/migrations/20260724210701_b6184936-e4a0-410d-8047-f67a2d026319.sql`
  (SHA-256 `ab8671e4…5353eeef`).
- **R2 SATISFIED BY P5-HF-001** (`BOR-DEC-024`). Not re-executed as a
  standalone migration. Any residual registry/dependency-metadata work folds
  into a future migration without repeating the REVOKE.
- **M0-E2 authorised** (`BOR-DEC-025`) — external clean-room replay only;
  Production replay forbidden. Two manifest sets materialised in
  `docs/PHASE5_M0_MIGRATION_MANIFEST.json` (`pre_hotfix_manifest` 36 files,
  `current_manifest` 37 files incl. P5-HF-001). `live_replay_sha256` banned as
  unprovable; corrected fields (`repo_sha256`, `scratch_applied_sha256`,
  `scratch_execution_status`, `scratch_execution_order`,
  `live_migration_record_present`, `live_schema_effect_match`,
  `evidence_source`) used instead. `deployed_artifact_sha256` intentionally
  omitted absent a trusted external source. Replay itself NOT executed in
  this sandbox — see `docs/PHASE5_M0_EXTERNAL_CLEANROOM_REPORT.md` §2, §6.
- **M4 test path** (`BOR-DEC-026`): historical M4 suites remain as-is;
  reclassification to `ACCEPTED SUPERSEDED EXPECTATION` requires both a
  pre-M5 checkpoint pass and a pass of
  `scripts/phase4-m4-post-m5-compat-tests.ts` (scaffolded).
- **17-suite regression**: unchanged — 15 PASS, 2 PRE-EXISTING FAILURE
  (`phase4-m4-adapter`, `phase4-m4`) awaiting the resolution path above.
- **Baseline verdict**: **BASELINE FAIL** (`BOR-DEC-027`) pending M0-E2 +
  M4 checkpoint + post-M5 compatibility. M1 and R3–R9 remain BLOCKED.




## 1. الحالة العامة

| المجال | الحالة | الدليل المعروف | ملاحظات |
|---|---|---|---|
| Marketplace MVP | منفذ مبدئيًا | Phase 0 summary | يحتاج Production Direct readiness |
| Tenancy & Security | مغلق مبدئيًا | 28 أو 34 tests | توحيد الرقم مطلوب |
| Catalog/Inventory/Fulfillment | مغلق | 153/153 | ledger/reservation/pick-pack-ship |
| Outbox/Workers/Reconciliation | مغلق | Phase 2+3 = 275/275 | 122 Phase 3 inferred |
| Bol M1 Control Plane | منفذ | 73/73 | live غير مفعل |
| Bol M2 Offers Import | منفذ | 67/67 | EAN hint only |
| Bol M3 Orders | منفذ | 102/102 | exception queue |
| Bol M4 Shadow/Live Dispatch | منفذ ومقفل | 37/37 + demo smoke | live disabled |
| Bol M5 FBR Shipping | منفذ | 79/79 | internal ship before confirmation |
| Phase 5 | غير معتمد | التقرير لم يُراجع | محادثة سابقة محذوفة |
| Borvat Direct | MVP جزئي | Phase 0 | أولوية تجارية حالية |
| External Merchant SaaS | غير مطلق | architecture foundation exists | onboarding/billing required |
| Auctions | مخطط | — | لم يعتمد كجاهز |
| Wallet/Settlement | مخطط | — | يحتاج PSP/ledger design |
| Loyalty/Referral | مخطط | — | فصل عن seller money |

## 2. مجموع الاختبارات المعروف

- Phase 2: 153.
- Phase 3: 122، ليصبح التراكمي 275.
- Phase 4 M1–M5: 358.
- الإجمالي المذكور: 633.

لا يستخدم الرقم 633 كدليل إنتاج منفرد. يجب إعادة التشغيل من بيئة نظيفة وربط كل اختبار بمتطلب.

## 3. قرارات إطلاق Bol

الحالة الحالية: **لا يوجد حساب في live mode**.

البوابة الملزمة:

1. Test account.
2. Read-only.
3. Shadow.
4. مراجعة findings.
5. موافقة صريحة من المالك.
6. Limited canary.
7. process status SUCCESS.
8. مراقبة وkill switch drill.
9. توسع تدريجي.

## 4. فجوات يجب إغلاقها قبل اعتماد Phase 5 أو إطلاق جديد

- قراءة تقرير المبرمج الكامل للمرحلة المحذوفة.
- التأكد من migrations والcommit IDs.
- توحيد عدد اختبارات Phase 1: 28 أم 34.
- تحديد نموذج الأسرار النهائي: Vault-only أم encrypted DB أم hybrid موثق.
- اختبار clean-room migration.
- مراجعة grants وRLS لكل RPC جديد.
- تحديث inventory/financial reconciliation evidence.
- تثبيت scope المرحلة التالية: Borvat Direct أم Phase 5 backend continuation.

## 5. الأولوية الحالية

1. مراجعة تقرير Phase 5.
2. تثبيت وثائق الحوكمة في repo.
3. رفع Borvat Direct إلى مستوى قناة بيع مستقلة.
4. Onboard الشركات الست كtenants طبيعية.
5. تجهيز controlled Bol canary دون فتح live عام.
6. بناء Seller Dashboard التشغيلي.
7. تجهيز SaaS metering/billing لأول تاجر خارجي.

## 6. قالب تحديث بعد كل مرحلة

### اسم المرحلة

- الهدف:
- Scope:
- Out of scope:
- Migrations:
- Tables/RPCs:
- UI:
- Security/RLS:
- Tests:
- Failures discovered:
- Hotfixes:
- Rollback:
- Production status:
- Live flags:
- Open risks:
- Owner decision required:
- Commit/tag:

## M1B-0B — CRITICAL FUNCTION ACL DRIFT ROOT CAUSE AND POST-DEPLOYMENT GATE (2026-07-26)

**Verdict:** M1B-0B PASS WITH RESIDUAL RISKS. **R-T20 CLOSED.**

- Root cause A: out-of-band platform provisioning re-grants blanket `SELECT,INSERT`/`EXECUTE` in `public` to the sandbox tooling role `sandbox_exec` on **existing** objects (118/118 functions, 74 relations at stage start).
- Root cause B: a new routine has `proacl = NULL`, which is the PostgreSQL default `EXECUTE TO PUBLIC`; proved by a live canary (3/3 app roles). M1B-0A's function-level deny-by-default conclusion was wrong and is corrected here.
- `place_order(uuid,integer,jsonb)`: only signature, revoked from every non-owner role **and body neutralised** (fail-closed `RAISE EXCEPTION`), so P5-HF-001 no longer depends on ACL state.
- Revoked: 32 trigger/guard routines from all app roles; `PUBLIC`/`anon` EXECUTE on every routine in `public` — closing 4 previously **anon-callable** SECURITY DEFINER inventory/channel routines.
- Protected tax/pricing/publication/shipping tables (11) re-asserted owner-only.
- New permanent control: `scripts/phase5-acl-gate/check-critical-acl.sh` (read-only post-deployment gate, exit 0/1/70) + `approved-routines.json` (75 approved signatures). A migration is not successful until the gate exits 0. Failure path proved (exit 1).
- Two post-commit cycles PASS. Rows changed 0. Business schema change none. Canary objects 0. Tax counts 4/9/5. Shipping foundation 0/0/0/0. Bol Live off. Stripe Live off.
- Open residuals: R-T21 (sandbox blanket grants on non-protected objects), R-T22 (historical sequence grants), R-S1/R-S2/R-S3 (shipping), R-5, R-T13, R-T15, R-T17.
- Next in order, each requiring separate Owner authorization: M1C-1C → M1C-1D → M1C-1E → M1C-1F → M1C-1G.

## M1C-1C — AUTOMATIC ORIGIN-TO-DESTINATION SHIPPING RATE-CARD FOUNDATION (2026-07-26)

**Status:** PASS WITH RESIDUAL RISKS. Schema foundation only — no resolver, no RPC, no UI, no data.

Added `public.shipping_rate_cards`, `public.shipping_rate_lanes`, `public.shipping_rate_rules`
(UUID keys, zero new sequences) plus five owner-only guard functions and one guard trigger on
`merchant_fulfillment_origins`. Platform vs merchant-store scoping, exact-origin vs origin-country
lanes, gist exclusion against overlapping weight/parcel tiers, activation and immutability guards.
All three tables: RLS enabled + forced, zero policies, zero application grants.

Row state after commit: cards/lanes/rules 0/0/0; origins/profiles/packages/assignments 0/0/0/0;
merchant stores 0; offer prices 0; publications 0; tax 4/9/5. Final row delta zero.

Verification: 31 functional assertions + 11 zero-delta assertions in a fail-loud self-rolling-back
harness; ACL gate PASS in two post-commit cycles with the simulated failure path still exiting 1.

Risks: R-S1 partially closed, R-S2 hardened, R-S3 open, R-T20 closed (reconfirmed), R-T21 open but
M1C-1C objects are now inside the gate inventory, R-T22 open for historical sequences only.
Observation for the owner: 9 pre-existing `channel_connections` rows carry `mode='live'` (Phase 4
fixtures, unchanged by this stage).

Next authorized step: none. M1C-1D (Delivery Promise Profiles), M1C-1E (Manual Quotes), the shipping
resolver and any UI require separate owner authorization.

## M1C-1D-A — DELIVERY PROMISE PROFILE AND FINAL ETA COMPOSITION PRECHECK (2026-07-26)

**Status:** SAFE DELIVERY PROMISE ARCHITECTURE IDENTIFIED. Design only — **zero changes**: no migration,
no table, no function, no data, no RPC, no UI, no resolver. Database access was read-only.

Designed (not built): `merchant_delivery_promise_profiles`, `merchant_delivery_promise_weekly_schedules`,
`merchant_delivery_promise_assignments`, `shipping_transit_time_rules`, `shipping_calendar_blackouts`,
optional `shipping_delivery_weekdays`. Seller handling is separated from carrier transit; the ETA is
composed from cut-off → handover → route transit → delivery calendars; timezone is an explicit IANA
zone; missing ETA is fail-closed and blocks checkout. Implementation split into M1C-1D-B/C/D/E.

Owner notes closed: (1) Appendix A — a 50-point requirement→test traceability matrix — appended to the
M1C-1C report (31 functional + 11 zero-delta assertions cover all 50 points). (2) Handling-class mapping
proved for oversized / dangerous goods / pickup only; **pallet is not representable → R-S4 recorded**,
`bulky` must never be treated as `pallet`.

**R-C1 verification (read-only): LIVE MODE METADATA ONLY — OPERATIONALLY DISABLED.** 9 of 71
`channel_connections` rows carry `mode='live'`, all with `live_authorized_at IS NULL`; the authorization
GUC is unset, `p4_dispatch_decision` returns `deferred_not_authorized` for all 9, there is no `pg_cron`
or `pg_net`, no `src/routes/api` surface, and the Bol worker is reachable only by a manual service-role
script that itself consults `p4_dispatch_decision`. Caveat: the legacy predicate `p4_writes_allowed()`
does not check `live_authorized_at` and returns true for those rows — it must be aligned or the rows
normalised to `read_only` before any outbound sync, order ingestion, inventory publishing or dispatch.

Risks: R-5 open (blocks all seller/activation write RPCs in M1C-1D-*), R-S1 partially closed, R-S2
hardened, R-S3 open, **R-S4 new/open**, **R-C1 open (metadata-only, outbound features blocked)**, R-T21
and R-T22 unchanged. Baselines unchanged: cards/lanes/rules 0/0/0, origins/profiles/packages/assignments
0/0/0/0, prices 0, publications 0, tax 4/9/5, `place_order` fail-closed, Bol Live off, Stripe Live off.

Next authorized step: none. M1C-1D-B, M1C-1E (manual quotes), the shipping/ETA resolver and any UI
require separate Owner authorization.

## M1C-1D-B — DELIVERY PROMISE PROFILE AND WEEKLY SCHEDULE FOUNDATION (2026-07-26)

**Status:** PASS WITH RESIDUAL RISKS. Schema foundation only — no assignment, no transit rules,
no resolver, no quotes, no RPC, no UI, no data.

Added `public.delivery_promise_profiles` (platform vs merchant-store scope through a composite FK to
`merchant_stores(id, company_id)`, family-scoped versioning, one active version per family, lifecycle
draft/active/inactive/superseded/retired) and `public.delivery_promise_weekly_schedules` (seven
normalized ISO weekday rows, cut-off contract, independent handover flag), plus four owner-only guard
functions and five triggers. Mandatory IANA timezone validated against the PostgreSQL catalog.
Activation requires a complete, consistent seven-day schedule; active/superseded/retired versions and
their weekly rows are immutable. UUID keys only, zero sequences (R-T22).

Both tables: RLS enabled + forced, zero policies, zero application/sandbox grants, owner-only.
Guard functions carry non-NULL `proacl` with no non-owner EXECUTE.

Verification: 54 assertions, 54 PASS, inside a fail-loud SECURITY DEFINER harness that was
force-rolled back and dropped (0 residual objects, 0 residual rows). ACL gate extended with the two
tables, the four functions, a sequence check and an RLS/policy check; first run FAILED (exit 1) on 28
re-granted sandbox privileges, a forward-fix normalization migration was applied, then two post-commit
cycles PASS with the simulated failure path still exiting 1. `place_order` had also been re-granted to
`sandbox_exec` and was re-revoked; final ACL `{postgres=X/postgres}`, body fail-closed.

Row state after commit: delivery promise profiles/schedules 0/0; cards/lanes/rules 0/0/0;
origins/profiles/packages/assignments 0/0/0/0; merchant stores 0; offer prices 0; publications 0;
tax 4/9/5. Final row delta zero. Bol Live off, Stripe Live off, all 9 `mode='live'` connections still
`live_authorized_at IS NULL`, `p4_dispatch_decision` = `deferred_not_authorized`, no `channel_*` row
changed, `p4_writes_allowed()` untouched.

Risks: R-5 open, R-S1/R-S2/R-S3/R-S4 unchanged, R-T21 open (new objects now inside the gate inventory),
R-T22 unchanged, R-C1 closed for the current state, **R-C2 open — blocker before any channel execution**.

Next authorized step: none. M1C-1D-C (assignments), M1C-1D-D (transit + calendars), M1C-1D-E (ETA
composition), manual quotes and any UI require separate Owner authorization.

## M1C-1D-C — STORE-SKU-ORIGIN DELIVERY PROMISE ASSIGNMENT FOUNDATION (2026-07-26)

Schema foundation only. Created `public.merchant_store_sku_delivery_promise_assignments`
(1 table, PK + 2 unique indexes + 4 supporting indexes, 8 constraints, 4 `m1c1dc_guard_*` functions,
4 triggers) plus two supporting UNIQUE constraints on `delivery_promise_profiles`
(`(id, scope_type)`, `(id, company_id, merchant_store_id)`). No sequences, no views, no RPC,
no policies, no UI.

Preflight proved the tenancy path declaratively: company → merchant store → store-SKU shipping
profile → eligible fulfillment origin, all four hops covered by existing UNIQUE constraints.
No ARCHITECTURE BLOCKER.

Contract: exact origin mandatory (BOR-DEC-078); `merchant_fulfilled` binds a same-store tenant
promise and `platform_fulfilled` a platform promise via generated columns + composite FKs
(BOR-DEC-079); `manual_quote` rejected (BOR-DEC-080); one active version per
(profile, origin, mode), forward-only versioning, fail-closed activation (active profile/origin/
eligibility/promise + 7 weekly rows; pickup-only, dangerous-goods and cold-chain draft-only) and
full immutability after activation (BOR-DEC-081). No shipping-rate linkage, no listing assignment,
no transit rules, no resolver, no store default fallback.

Migrations: `20260726145235_…` (foundation, SHA-256 `bd42afda47103a6272dc3b19ee44df6ebfd0b759713bf4d8944541ba44e204ab`)
and `20260726145444_…` (R-T21 forward-fix normalization, SHA-256 `3a3755cffd7a1bf9c2d3803b915249255d0fb9751dace8e1fa94eb510553f65b`).
Two earlier attempts failed fail-loud and rolled back completely.

Verification: 61 assertions, 61 PASS, inside a fail-loud in-migration harness; all fixtures deleted
before commit, no temporary routine survived. ACL gate extended with the assignment table, the four
new guard functions, RLS/force/zero-policy checks, sequence check, runtime deny proof and a
forbidden-object check (transit/manual-quote/default/listing). First post-commit run FAILED (exit 1):
Mechanism A had re-granted `sandbox_exec` on `place_order`, the 16 protected tables and the
M1C-1D-B/1D-C guard functions; after the forward-fix migration the gate PASSED two consecutive
post-commit cycles and the simulated failure path still exits 1. `place_order` final ACL
`{postgres=X/postgres}`, body fail-closed.

Row state after commit: assignments 0; promise profiles/schedules 0/0; origins/profiles/packages/
eligibility 0/0/0/0; merchant stores 0; cards/lanes/rules 0/0/0; tax 4/9/5; offer prices 0;
publications 0. Final row delta zero. Bol Live off, Stripe Live off, all 9 `mode='live'` connections
still `live_authorized_at IS NULL`, no `channel_*` row changed, `p4_writes_allowed()` untouched.

Risks: R-5 open, **R-S1 closed for assignment activation**, R-S2/R-S3/R-S4 unchanged, R-T21 open
(recurred and normalized forward-only; gate mandatory), R-T22 unchanged,
**R-C2 open — blocker before any channel execution**.

Next authorized step: none. M1C-1D-D (transit + calendars), M1C-1D-E (ETA composition), manual
quotes, seller/admin write RPCs and any UI require separate Owner authorization.

## M1C-1D-D — TRANSIT-TIME AND DELIVERY-CALENDAR FOUNDATION (2026-07-26)

Schema foundation only. Created six tables — `shipping_transit_time_profiles`,
`shipping_transit_time_weekday_rules`, `shipping_transit_delivery_weekdays`,
`shipping_calendar_profiles`, `shipping_calendar_blackout_dates` and
`shipping_transit_time_profile_calendars` — plus nine `m1c1dd_guard_*` functions and their triggers.
No sequences, no views, no RPC, no policies, no UI, no seeded data.

Read-only preflight: rate cards/lanes/rules present and empty, origins and delivery-promise objects
present and empty, **no existing calendar or holiday model**, vocabularies reused verbatim. The
preflight did not prove a mandatory one-to-one relation between rate rules and carrier services, so
**no FK links rates to transit profiles**; service mapping is deferred. No ARCHITECTURE BLOCKER.

Contract: transit is versioned separately from handling and price, destinations are independent of
local markets (BOR-DEC-082); duration is per ISO handover weekday with explicit support flags and
min/max business-day ranges, delivery capability is per ISO weekday with an explicit flag, and active
profiles need 7 + 7 rows with at least one supported handover and one enabled delivery day
(BOR-DEC-083); holidays and closures live in versioned typed calendars with mandatory IANA timezones
validated against `pg_timezone_names`, an allowlisted blackout `reason_code`, and three mandatory
active calendar roles bound by a role↔type composite FK with matching tenancy and country
(BOR-DEC-084); one active version per family, forward-only supersession and full immutability after
activation, children writable only while the parent is draft (BOR-DEC-085). Activation integrity runs
on a DEFERRABLE INITIALLY DEFERRED constraint trigger so a complete profile can be assembled in one
transaction. No ETA resolver, no promise↔transit linkage, no manual quotes, no date booking.

Migrations: `20260726150928_…` (foundation + ACL normalization, SHA-256
`6acd4baba868e94e68f9210758d25bf1c240b76b8736f492dc2efbca8d3698b8`) and `20260726151219_…`
(fail-loud rollback harness, SHA-256
`75659b1449c0ed3a531d93c7c844b3e7716abbead931452978f66afac83dfd7f`).

Verification: 45 assertions, 45 PASS, inside a rolled-back subtransaction covering scope/tenancy,
cross-tenant rejection, origin country parity, weekday and delivery-day rules, versioning and
supersession, IANA validation, calendar role/type and country matching, activation integrity,
immutability, RLS/force/zero-policy/zero-grant and zero-sequence checks. All fixtures rolled back; no
temporary routine survived. ACL gate extended with the six tables, the `m1c1dd_guard_%` lock and
inventory (=9), RLS/force (=6), zero policies, sequence check (R-T22), runtime deny proof and a
tightened forbidden-object check; **PASS in two consecutive post-commit cycles**, simulated failure
path still exits 1. Mechanism A (R-T21) did not recur this cycle; normalization ran regardless.
`place_order` final ACL `{postgres=X/postgres}`, body fail-closed.

Row state after commit: all six new tables 0; promise assignments 0; promise profiles/schedules 0/0;
origins/profiles/packages/eligibility 0/0/0/0; cards/lanes/rules 0/0/0; tax 4/9/5; offer prices 0;
publications 0. Final row delta zero. Bol Live off, Stripe Live off, all 9 `mode='live'` connections
still `live_authorized_at IS NULL`, no `channel_*` row changed, `p4_writes_allowed()` untouched.

Risks: R-5 open, R-S1 unchanged (closed for assignment activation), R-S2 open as a runtime
requirement for the future resolver, R-S3 open (labels/checkout), R-S4 open (pallets unrepresented),
R-T21 open as a mandatory deployment constraint, R-T22 unchanged,
**R-C2 open — blocker before any channel execution**.

Next authorized step: none. M1C-1D-E (ETA composition/resolver), manual shipping quotes, seller/admin
write RPCs and any UI require separate Owner authorization.

## M1C-1D-E — FINAL ETA COMPOSITION RESOLVER PRECHECK (2026-07-26)

Analysis and design only. **No migration, no permanent table or function, no resolver, no RPC, no UI,
no checkout, no manual quote, no carrier or channel call, no persisted data.** Catalog reads only;
every shipping/promise/transit/calendar/rate table still holds 0 rows, tax remains 4/9/5.

Dependency path proven declaratively: store-SKU shipping profile → eligible exact origin → active
promise assignment → promise weekly schedule → transit profile → three role calendars → delivery date
range. Rate lanes attach to the same route tuple but carry no link to transit profiles.

**Rate-to-transit matching result: B — EXPLICIT MAPPING REQUIRED.** `sttp_one_active_per_family_uk`
constrains one active version per `profile_code`, not one active profile per route, so two active
profiles may match the same carrier/service/origin/destination at the same precedence tier. A junction
(`shipping_rate_lane_transit_profiles` or `shipping_service_route_bindings`) is required before any
permanent resolver; until then multiplicity must return `ambiguous_configuration`.

Contracts proposed (BOR-DEC-086..090): four-tier precedence with fail-closed ambiguity; absolute
`timestamptz` input evaluated in the promise IANA timezone with cut-off, handling, handover, transit
min/max and destination alignment as staged per-calendar steps and a 60-day horizon; mandatory
current-state revalidation of assignment, profile, origin, eligibility, promise, transit and calendars
(R-S2); independent `eta_resolved` and `commercial_shipping_resolved`; structured output carrying the
exact versioned configuration.

Harness: temporary in-memory harness executed once and deleted; no transaction opened, no fixture
persisted, no permanent function created. **56 assertions, 56 PASS.** Two intermediate failures were
genuine specification findings (Saturday handover requires handling days to allow it; zone-less local
timestamps must be rejected explicitly) and were corrected before the final run.

New risk **R-S5 OPEN** — destination granularity is country-level only; ETAs may mislead island and
remote postcodes until a destination-zone model exists.

**R-T21 ACTIVE DRIFT (not caused by this phase):** the platform re-grant mechanism restored
`sandbox_exec` EXECUTE on `place_order` (`{postgres=X/postgres,sandbox_exec=X/postgres}`, body still
fail-closed) plus read access to all protected tax/pricing/shipping/transit/calendar tables and the
M1C-1D-B/C/D guard functions. **ACL GATE: FAIL.** Remediation is a normalization-only migration, which
this authorization forbids — halted pending Owner instruction.

R-C2 unchanged and still a blocker: 9 `mode='live'` connections all `live_authorized_at IS NULL`,
`p4_writes_allowed()` untouched, dispatch `deferred_not_authorized`, no worker or outbound call ran.

Next authorized step: none. An ACL normalization migration, the explicit rate/transit binding, the
permanent ETA resolver, manual quotes and any UI each require separate Owner authorization.

## M1C-1E-E-R3 — ACCEPTANCE SETTLEMENT REPAIR AND FAMILY SERIALIZATION (2026-07-26)

Manual shipping quote acceptance is now functional for the first time. The R2 evidence run proved a P0:
the deferred settlement guard still read `manual_shipping_quote_acceptance_conditions`, dropped in R1, so
every acceptance aborted at COMMIT with 42P01. The guard was repaired and now validates only the authorized
invariants (offer settled, request settled, siblings terminal, exactly one `acceptance_recorded` event in
the same transaction). W1 was closed in the same authorization: `public.m1c1ee_guard_family_lock(uuid)`
(owner-only, empty pinned search_path) takes a transaction-scoped advisory lock on `request_family_id`, and
the request, offer and acceptance guards all acquire it in one order before validating. A family holding an
acceptance is permanently closed to new request versions with SQLSTATE `BVQ01`.

Scope held: no new tables, columns or statuses; no RPC, UI, checkout, payment, order, reservation, carrier
booking, messaging or cron. Guard inventory moved 18 -> 19 for the lock helper and the gate was updated to
assert 19, not loosened.

Verification: harness 44/44 PASS (including P0 regression B22/B23 and static assertions S19/S20/S21),
concurrency C1-C4 4/4 PASS with 0 deadlocks, static scan zero references to every R1-dropped object.
Persistent rows: 0 in all seven manual quote tables.

Security: M1B-0M (REVOKE-only) was reverted by the platform post-migration re-grant (R-T21, cycle 14) and
re-applied by M1B-0N, which held. ACL GATE: PASS 58/58, failure path still exits 1. `anon`, `authenticated`
and `service_role` hold zero privileges on protected objects; `place_order` executable by no application
role. Live-authorized channels: 0.

Risks: R-T21 open and still a mandatory deployment constraint (normalize then gate on every deployment),
**R-Q1 new/open** (advisory lock binds only guard-path writers; re-review before any RPC),
**R-Q2 new/low** (single-family write queuing), R-5, R-S3, R-S4, R-C1, R-C2, R-T22 unchanged.

Next authorized step: none. The manual quote application RPC, expiry scheduling, UI, checkout binding and
order creation each require separate Owner authorization.

---

## PHASE 0 — P0-1 GRANT HARDENING (2026-07-31)

Migration: `20260731232446_f9ee9ffa-914e-4ad3-845d-40d8e570b23c.sql`
SHA-256: `6af0045465a9c349c88e3b35d088e77f345d9e59236ad58f253204edca69f488`
Type: REVOKE-only + policy-derived allowlist re-grant. Rows changed 0. Schema changed none.
No file under `src/` was modified. Report: `docs/PHASE0_P0_1_GRANT_HARDENING_REPORT.md`.

State change (public schema table ACLs):
- `anon`: 8 privilege types over ~59 tables → **SELECT only, 6 tables**
  (`categories`, `inventory_dispositions`, `permissions`, `products`, `role_permissions`,
  `system_company_roles`). **F-2 CLOSED.**
- `authenticated`: 8 privilege types over ~60 tables → policy-derived only
  (SELECT 66 / INSERT 22 / UPDATE 19 / DELETE 14; zero TRUNCATE/TRIGGER/REFERENCES/MAINTAIN).
- `service_role` and `sandbox_exec`: intentionally untouched.

Invariants re-verified after apply (identical to before): policies 122, orders 0, order_items 0,
companies 163, `live_authorized_at IS NOT NULL` = 0, active products 38, user_roles 188,
`place_order` not executable by anon/authenticated/service_role/PUBLIC, `/checkout` still
hard-disabled in source.

Acceptance: A1 PASS, A2 PASS (exactly 6), A3 PASS, A6 PASS (home, category, PDP, search, cart,
auth, seller dashboard all render; zero console errors, unauthenticated Chromium),
A7 PASS, A8 PASS, A11 PASS. A4/A5/A12 are P0-2 scope; A9/A10 are P0-3 scope.

ACL gate `scripts/phase5-acl-gate/check-critical-acl.sh` exit 1 — **all** failures attribute to
pre-existing `sandbox_exec` blanket grants (R-T21, cycle 15) plus the M1V-1D-A residue
`m1v1da_require_reviewer()` not yet in the approved-routine allowlist. Not caused by P0-1;
no normalization cycle was run (BOR-DEC-152).

Open Phase 0 items: none. **P0-1 / P0-1a / P0-2 / P0-3 all applied.** F-2, F-3, F-3b, F-3c and
F-9 are CLOSED.

## 2026-08-01 — PHASE 0, MIGRATION P0-3 (FIXTURE PURGE) APPLIED

Destructive and irreversible; rollback is a point-in-time restore. Report:
`docs/PHASE0_P0_3_FIXTURE_PURGE_REPORT.md`. Decisions BOR-DEC-157…160.

State change (data only — no grant, policy, or schema change):
- `companies`: 163 → **1** (`Qnan B.V.`). 162 fixture companies plus their full descendant
  closure (channel, inventory, outbox, catalog, shipping, store, seller-workflow subtrees) deleted
  in one transaction. **F-9 CLOSED.**
- `channel_connections` in `mode = 'live'`: 9 → **0**.
- `user_roles` rows with `role = 'seller'`: 188 → **0** (P0-2 residue was entirely fixture-owned).
- `merchant_stores`: 1 (IBBO, `draft`). `orders` 0. `catalog_products` / `catalog_skus` now 0.
- Preserved: Qnan's `seller_applications` row (pending) and `company_legal_identities` row.
- `products` (legacy non-company-scoped storefront table): 38, untouched. Storefront home 200.

Method note: 28 append-only/immutability `BEFORE DELETE` guards were disabled and re-enabled
inside the same transaction (`session_replication_role` is not grantable here). FK triggers stayed
enabled, which surfaced three real delete-ordering defects and 24 tables the handover script had
omitted. Post-condition asserts zero public triggers left disabled — PASS.

Standing prohibitions unchanged: Qnan is operational but **not legally verified** — no Verified
badge, no public store publication, no product publication, no payments, no settlement, no channel
live mode.


Risks: R-T21 open and unchanged. F-10 (95 unwrapped `auth.uid()` policies, 31 unwrapped
`is_company_member()`) untouched — scheduled W2-1 sweep, not Phase 0. 14 tenant-scoped tables
still lack a leading `company_id` index. Bol adapter v11/v10 split defect (handover §11) open and
blocking any Bol canary.
