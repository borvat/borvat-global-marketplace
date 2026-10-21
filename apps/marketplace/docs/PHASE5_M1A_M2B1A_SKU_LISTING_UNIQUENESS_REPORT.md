# PHASE 5 — M1A #2B-1a — Additive Partial Unique Index (Halt Report)

**Verdict:** **DATA CONFLICT — INDEX NOT APPLIED**
**Mode:** Read-only pre-check only. Zero migrations executed. Zero DDL. Zero rows changed. No trigger, no RLS, no GRANT/REVOKE.
**Authorization envelope:** BOR-DEC-035 (`M1A #2B-1a`) — additive-only partial unique index; Pre-check §Pre-check requires halt on any conflict.

---

## 1. Proposed Index (Not Applied)

```sql
CREATE UNIQUE INDEX channel_listings_borvat_direct_draft_sku_uk
  ON public.channel_listings (channel_account_id, sku_id)
  WHERE sku_id IS NOT NULL
    AND offer_id IS NULL;
```

Name accepted per naming convention. Predicate not modified.

---

## 2. Pre-check Results

### 2.1 Rows matching the predicate

```
SELECT count(*) FROM public.channel_listings WHERE sku_id IS NOT NULL AND offer_id IS NULL;
-- rows_in_predicate = 115
```

### 2.2 Provider breakdown of predicate rows

| provider | count |
|---|---|
| `bol` | **115** |
| `borvat_direct` | 0 |
| (other) | 0 |

### 2.3 Duplicate `(channel_account_id, sku_id)` pairs within the predicate

```
SELECT channel_account_id, sku_id, count(*)
FROM public.channel_listings
WHERE sku_id IS NOT NULL AND offer_id IS NULL
GROUP BY 1,2 HAVING count(*) > 1;
```

**Result: 8 duplicate pairs, 16 rows total.** All are provider `bol`, status `draft`, control_state `read_only_import`. Each pair has identical `(channel_account_id, sku_id)` but distinct `external_listing_id` in the pattern `M2-L1-<n>` vs `M2-L1-DUP-<n>`, and distinct `published_quantity` (10 vs 20). Sample:

| id (truncated) | channel_account_id (truncated) | sku_id (truncated) | external_listing_id | published_qty |
|---|---|---|---|---|
| `973cb025…` | `18ea60bb…` | `e064f4f3…` | `M2-L1-1784845427429` | 10 |
| `8e63ede5…` | `18ea60bb…` | `e064f4f3…` | `M2-L1-DUP-1784845427429` | 20 |
| `59650365…` | `6aa1f779…` | `d5fb6838…` | `M2-L1-1784846329884` | 10 |
| `c9028918…` | `6aa1f779…` | `d5fb6838…` | `M2-L1-DUP-1784846329884` | 20 |
| … (8 pairs total across 8 different `channel_account_id`s / companies) | | | | |

### 2.4 Existing indexes on `public.channel_listings`

| indexname | definition |
|---|---|
| `channel_listings_pkey` | UNIQUE (id) |
| `channel_listings_channel_account_id_external_listing_id_key` | UNIQUE (channel_account_id, external_listing_id) |
| `channel_listings_company_idx` | (company_id) |
| `channel_listings_account_idx` | (channel_account_id) |

No index with the target name exists. No equivalent partial unique index on `(channel_account_id, sku_id)` exists.

### 2.5 Offer-level listings baseline

```
SELECT count(*) FROM public.channel_listings WHERE offer_id IS NOT NULL;  -- 0
```

Zero offer listings currently exist. Predicate would not affect any offer row today.

---

## 3. Conflict Analysis

### 3.1 Direct violation

The proposed unique index would fail at `CREATE UNIQUE INDEX` time with `SQLSTATE 23505` on the 8 existing duplicate pairs. Postgres cannot build a unique index on data that already violates the target uniqueness.

### 3.2 Semantic conflict (independent of the 8 duplicates)

The current effective invariant on `channel_listings` is:

> Multiple rows may share the same `(channel_account_id, sku_id)` as long as they carry distinct `external_listing_id` values.

The 8 duplicate pairs are deliberate seed/test evidence of that invariant — the naming `M2-L1-<n>` / `M2-L1-DUP-<n>` and the paired `published_quantity` (10 vs 20) match a Phase 2 test fixture pattern. The existing UNIQUE `(channel_account_id, external_listing_id)` is the intended uniqueness key for `bol` SKU drafts.

Enforcing the proposed index would **retroactively narrow that Bol invariant**, changing the meaning of existing Bol SKU-level listings — not additive. This violates the Pre-check clause:

> "الفهرس لا يغيّر معنى Offer listings الحالية"

Interpreted broadly (the intent — "does not change the meaning of existing listings"), the same rule applies to the current Bol SKU drafts, which the predicate `sku_id IS NOT NULL AND offer_id IS NULL` also captures.

### 3.3 Correction to BOR-DEC-034 / BOR-DEC-033

The prior report `docs/PHASE5_M1A_M2B1_DRAFT_LISTING_WRITE_PATH_REPORT.md` §3 stated:

> "Current inventory: 115 Bol import-draft listings, all with `sku_id IS NULL` (imported at offer level)."

**That statement was incorrect.** The 115 rows have `sku_id IS NOT NULL AND offer_id IS NULL`. This report supersedes that sentence. The forward-fix proposed in BOR-DEC-034 (an unconditional partial unique index on `(channel_account_id, sku_id) WHERE sku_id IS NOT NULL AND offer_id IS NULL`) is therefore **not applicable as written** — it would collide with the current Bol drafts.

---

## 4. Object Delta

None. Zero writes.

- No migration file created.
- No index created.
- No row modified, inserted, or deleted.
- No function, trigger, policy, or grant changed.

Row counts unchanged:
- `channel_listings` = 115 (same as pre-check).
- `channel_listings WHERE offer_id IS NOT NULL` = 0.
- `channel_listings WHERE provider='borvat_direct'` = 0.

Baseline invariants (re-verified read-only): `place_order` EXECUTE remains limited to `postgres` + `sandbox_exec` (P5-HF-001 intact); `channel_connections.live_authorized_at NOT NULL` count = 0; RLS enabled on 62/62 public tables.

---

## 5. Options for Owner (not applied — for decision only)

The halt is definitive under this authorization. The following are **presented for a follow-up decision**, not executed.

### Option A — Narrow the predicate to `borvat_direct`

Because `channel_listings` has no `provider` column, provider identity is transitive. An index cannot filter on a joined column, so the narrowing must be transitive-safe. Two subvariants:

- **A1. Narrow by control_state + status combination unique to Borvat Direct fail-closed accounts.** Borvat-Direct listings are authored server-side with `control_state='paused'` AND `status='draft'` AND `external_listing_id IS NULL`. Bol drafts today have `control_state='read_only_import'`. Proposed predicate:
  ```sql
  CREATE UNIQUE INDEX channel_listings_borvat_direct_draft_sku_uk
    ON public.channel_listings (channel_account_id, sku_id)
    WHERE sku_id IS NOT NULL
      AND offer_id IS NULL
      AND external_listing_id IS NULL
      AND control_state = 'paused'
      AND status = 'draft';
  ```
  Pre-check against this predicate:
  ```
  SELECT count(*) FROM public.channel_listings
  WHERE sku_id IS NOT NULL AND offer_id IS NULL
    AND external_listing_id IS NULL
    AND control_state = 'paused'
    AND status = 'draft';
  -- would return 0 today
  ```
  Zero rows would match; index build would succeed without touching existing data.

  Trade-off: enforcement depends on the RPC always writing exactly this quadruple. That is acceptable because the RPC is the only creation path (§6 forbids direct DML for `authenticated`/`anon`/`service_role`/`sandbox_exec`), and it hard-codes those values (§7).

- **A2. Add a `WHERE channel_account_id IN (SELECT id FROM channel_accounts WHERE provider='borvat_direct')`-style predicate.** Not possible — Postgres partial indexes require the predicate to be `IMMUTABLE`-safe, and subqueries against another table are disallowed.

### Option B — Enforce uniqueness at RPC time via `INSERT ... ON CONFLICT` against the existing UNIQUE `(channel_account_id, external_listing_id)`

Have the RPC generate a **deterministic** `external_listing_id` for the internal channel, e.g. `borvat_direct:<catalog_sku_id>`, so the existing UNIQUE constraint acts as the natural idempotency key. Zero schema change. Zero new index.

- **Pros:** No new object at all; reuses an existing DB-level uniqueness invariant; is atomic and race-safe via `ON CONFLICT`.
- **Cons:** Overloads `external_listing_id` semantically for an internal provider. Recorded as RR-2B-E in BOR-DEC-033. Requires an explicit convention decision at the RPC-authorization step, not now.

### Option C — Backfill the 8 Bol duplicates before applying an unconditional index

Rejected by this authorization — §Scope forbids "Backfill" and "لا تعديل أو حذف بيانات". Not pursued.

---

## 6. Halt Trigger

Per BOR-DEC-035 Pre-check clause and §شرط التوقف:

> "لا Duplicate pairs لـ(channel_account_id, sku_id) ضمن Predicate"
> "الفهرس لا يغيّر معنى Offer listings الحالية"
> "ظهرت بيانات متعارضة" → STOP.

Both duplicate-pair and semantic-meaning conditions are triggered. Halt is mandatory. Conditional return to M1A #2B-1 is **NOT** engaged (only PASS / PASS WITH RESIDUAL RISKS engage it).

---

## 7. Deliverables

- This report.
- BOR-DEC-036 halt entry appended to the decision log.
- `docs/PHASE5_M1A_M2B1_DRAFT_LISTING_WRITE_PATH_REPORT.md` (from BOR-DEC-034) also stands corrected on the row-inventory statement (see §3.3).

---

## 8. Final Verdict

**M1A #2B-1a — DATA CONFLICT — INDEX NOT APPLIED**

Halted before any DDL. Owner input required to choose Option A1, Option B, or a different scoping approach. No further work on #2B-1 (the RPC) proceeds until the idempotency floor is authorized under a new scope.
