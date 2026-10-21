# Phase 4 — Migration 5 Charter (Revision 2, Proposed)

**Status:** Revision 2 — incorporates the three mandatory corrections from
the M5 review: (a) physical ship precedes Bol confirmation, (b) a
dedicated shipment outbox stream, (c) tightly scoped shipment cancel.
Awaiting explicit approval before any DDL runs.

**Depends on:** Phase 4 M1–M4 (locked), Phase 2 M2/M4 (inventory ledger,
fulfilment states), Phase 3 M1/M2 (outbox lease/claim/DLQ primitives —
**reused as a pattern, not as the same table**).

---

## 0. Binding launch constraint (locked, recorded on M4 close)

> **No Bol account is authorized for `live` mode.**
>
> Before the first live write to any Bol account, the following gate must
> pass in this exact order, with no shortcuts:
>
> 1. A **dedicated test account** on Bol (not a customer's production seat).
> 2. Connection provisioned in **`read_only_import`** and exercised for
>    offer import + order ingestion.
> 3. Connection promoted to **`shadow`** and left there long enough to
>    produce a full transcript of would-be writes; a human reviews it.
> 4. **Explicit written approval from the project owner** (this thread) to
>    proceed with a **limited v11/PATCH** update on that test account
>    only.
> 5. **Real `process-status` verification** against Bol's production
>    tenant showing terminal `SUCCESS` (not the Bol Demo mocked
>    `PENDING`).
>
> **Unit tests for v11/PATCH are NOT a substitute for step 5.**
>
> M5 must not introduce any code path that lets a customer connection
> transition to `live` without this gate. Enforcement lives in the DB
> (see §4.3) and in the worker (see §5.4).

---

## 1. Name and scope

**Name:** FBR Fulfilment & Shipment Sync (multi-tenant, Bol-only in this
migration; adapter shape is channel-agnostic for future carriers).

**In scope**

- Bind Phase 2 `fulfilment_tasks` and the physical `pick → pack → ship`
  lifecycle to **Bol shipment confirmations**.
- Introduce `channel_shipments` (per-tenant, per-connection) as the
  local record of a **real physical shipment that has already left our
  warehouse**, together with its subsequent Bol-side confirmation status.
- Introduce a **dedicated shipment outbox stream**
  (`shipment_outbox_events`) that reuses Phase 3's claim / lease / DLQ /
  idempotency machinery as a **pattern** but does not share the
  listing-oriented `outbox_events` table, listing_version ordering, or
  superseding semantics (§3).
- Extend the M4 dispatch decision so shipment events obey the same
  `read_only / shadow / live` gate and the same kill-switch check.
- Close `channel_order_lines` only after **both** sides agree:
  Phase 2 ledger shows `shipped`, **and** Bol has confirmed the shipment
  (`bol_confirmed`). Bol failure after our internal ship does NOT
  reverse the inventory movement (§2).
- Ingest Bol's async shipment status updates (delivered / returned) via
  a dedicated inbound RPC — mirrored on `channel_shipment_events`.

**Out of scope (deferred)**

- Return Merchandise Authorization (RMA) flow beyond recording a
  `returned` terminal state on the shipment.
- Invoicing / VAT documents (Bol invoice endpoints).
- FBB (Bol-fulfilled) — those lines already sit in the exception queue
  per M3 and stay there until a later migration.
- Reconciliation of shipment drift (that belongs to a future M6, parallel
  to Phase 3 M3 reconciliation but scoped to shipments).
- Any code path that bypasses the shipment outbox to talk to Bol
  synchronously.
- **General-purpose `bol.shipment.cancel`.** See §3.3: this migration
  ships only a strictly bounded pre-handover cancel. If review shows no
  documented Bol path fits that boundary, cancel is dropped from M5
  entirely and deferred; **no cancel endpoint is invented**.

---

## 2. Physical-ship-first ordering (BINDING)

This is the correction that anchors M5. Bol is an external system and
may lag, retry, or fail. A physical package that has left the warehouse
is a real-world event that has already happened and MUST NOT be undone
because Bol has not yet answered.

**Mandatory order for every FBR shipment:**

```
  picked  →  packed
    →  internal ship recorded in Phase 2 ledger
         (inventory transaction posted; fulfilment_task = 'shipped')
    →  channel_shipments row transitions to 'pending_bol_confirmation'
    →  shipment_outbox_events row enqueued (bol.shipment.confirm)
    →  worker dispatches to Bol
    →  Bol process-status SUCCESS     ⇒  channel_shipments = 'bol_confirmed'
    →  Bol process-status FAILURE     ⇒  channel_shipments stays
                                          'pending_bol_confirmation';
                                          only the Bol confirmation is
                                          retried. Ledger, task, and
                                          reservation are NOT reversed.
```

**Non-reversal rules (enforced in DB and tests):**

- Phase 2 inventory transaction posted during internal ship is not
  rolled back on any Bol outcome — never by the worker, never by the
  outbox, never by the shipment RPCs.
- `fulfilment_tasks.status = 'shipped'` set during internal ship is not
  rolled back on any Bol outcome.
- The M3 reservation released by internal ship is not re-created on Bol
  FAILURE. Bol FAILURE only re-queues the **confirmation** attempt.
- `bol.shipment.confirm` DLQ exhaustion parks the confirmation for
  operator resolution; it does **not** reopen the physical shipment.

The `channel_order_lines` row moves to its closed state only when both
of the following hold, checked under advisory lock on
`(company_id, order_line_id)`:

1. Phase 2 fulfilment task is `shipped` (or a later state Phase 2 owns).
2. `channel_shipments.status IN ('bol_confirmed', 'delivered', 'returned')`.

Neither side may unilaterally close the order line.

---

## 3. Dedicated shipment outbox stream

The Phase 3 listing outbox is correct for stock and price updates: it is
keyed on listing target and version, and later versions supersede earlier
in-flight ones. That semantic is **wrong** for shipments — two distinct
shipments against the same offer are independent real-world events, and
neither may cancel or supersede the other on the basis of any version
number.

### 3.1 `shipment_outbox_events` (new table)

```
id                    uuid pk default gen_random_uuid()
company_id            uuid not null
channel_account_id    uuid not null
channel_shipment_id   uuid not null           -- (company_id, cs_id) composite FK
event_kind            text not null           -- see 3.3 below
payload               jsonb not null          -- redacted per M1 rules
status                text not null           -- pending|in_flight|succeeded|failed|dead
attempt_count         int  not null default 0
next_visible_at       timestamptz not null default now()
lease_owner           text
lease_expires_at      timestamptz
last_error            text
external_ref          jsonb                   -- processStatusId, etc
created_at, updated_at timestamptz
```

**Idempotency key (UNIQUE):**
`(company_id, channel_account_id, channel_shipment_id, event_kind)`.

**One-in-flight index (partial UNIQUE, `WHERE status = 'in_flight'`):**
same tuple as above. Two `in_flight` rows for the same
`(company_id, channel_account_id, channel_shipment_id, event_kind)` is
a correctness bug.

**Explicit non-features (BINDING):**

- No `listing_version` column, no listing-version ordering, no
  `superseded` status. Version-based supersession does not apply.
- No cross-shipment ordering: two shipments A and B for the same
  `(company_id, channel_account_id, offer_id)` each own their own outbox
  row and dispatch independently. B cannot supersede A and A cannot
  block B.
- The listing `outbox_events` table is NOT modified in M5. Shipment
  events never appear in it and its one-in-flight index is not
  extended.

### 3.2 Reused primitives (from Phase 3 M2, pattern only)

New shipment-scoped RPCs mirror the Phase 3 shapes but operate on
`shipment_outbox_events`:

- `claim_shipment_outbox_batch(worker_id, lease_ttl, batch_size)`
- `complete_shipment_outbox_event(event_id, external_ref)`
- `fail_shipment_outbox_event(event_id, error, transient)` — backoff +
  DLQ move on exhaustion.
- `recover_expired_shipment_leases()`
- `shipment_outbox_dead_letters` — same shape as the Phase 3 DLQ.

All `service_role`-only, identical to the Phase 3 lockdown.

### 3.3 Allowed `event_kind` values

| event_kind              | when enqueued                              | idempotency        |
|-------------------------|--------------------------------------------|--------------------|
| `bol.shipment.confirm`  | after internal ship, per §2                | one per shipment   |
| `bol.shipment.cancel`   | strictly bounded, see below                | one per shipment   |

**`bol.shipment.cancel` scope (BINDING):**

- Allowed **only** while `channel_shipments.status = 'draft'` — i.e.
  before the physical handover to the carrier and before the confirm
  event has been enqueued.
- Rejected once the shipment is `pending_bol_confirmation` or later.
  After internal ship, cancel does not exist as a concept: the package
  is on its way and there is nothing to release.
- **Gate on Bol-side path documentation:** if, at DDL time, review of
  Bol Retailer API v11 shows no documented endpoint for cancelling an
  as-yet-unconfirmed shipment intent, `bol.shipment.cancel` is removed
  from M5 entirely, `event_kind` collapses to just
  `bol.shipment.confirm`, and cancel is deferred to a future migration.
  **No endpoint is invented.** The closure report records which
  branch was taken.

---

## 4. Multi-tenant invariants (non-negotiable)

Every table, RPC, event, and dispatch record in this migration carries
`company_id` and `channel_account_id`, and every RLS policy scopes reads
to `is_company_member(auth.uid(), company_id)`.

- A shipment row is identified by `(company_id, channel_account_id, id)`.
  `id` is a server-generated UUID; the Bol-side `shipmentId` is stored
  separately and is nullable until Bol returns it.
- A shipment is bound to exactly one `channel_order_line`, and that
  order line's `(company_id, channel_account_id)` MUST match the
  shipment's — enforced by a composite FK, not an app-level check.
- A shipment is bound to exactly one Phase 2 `fulfilment_task`; the task
  MUST belong to the same company (composite FK).
- Cross-tenant shipment ingestion, snapshotting, or resync is a
  correctness bug; tests assert this by attempting cross-tenant calls
  and expecting `permission_denied` or `not_found`.

---

## 5. Schema (proposed DDL shape, not final SQL)

### 5.1 `channel_shipments`

```
id                    uuid pk default gen_random_uuid()
company_id            uuid not null
channel_account_id    uuid not null
channel_order_line_id uuid not null       -- (company_id, cal_id) composite FK
fulfilment_task_id    uuid not null       -- (company_id, ft_id) composite FK
transporter_code      text not null       -- Bol carrier code
track_and_trace       text
bol_shipment_id       text                -- populated after Bol returns it
bol_process_status_id text                -- last observed processStatusId
status                text not null       -- see below
last_error            text
shipped_at            timestamptz         -- when Phase 2 ledger recorded ship
bol_confirmed_at      timestamptz         -- when Bol first returned SUCCESS
terminal_at           timestamptz
created_at, updated_at timestamptz
```

**Status lattice (single source of truth for the ordering in §2):**

```
draft
  → pending_bol_confirmation      -- set atomically with internal ship
  → bol_confirmed                 -- Bol SUCCESS observed
  → delivered | returned          -- inbound status from Bol
  → (terminal)
  ↳ cancelled                     -- only from 'draft' (see §3.3)
```

`CHECK` constraint enforces the lattice at DB level. `failed` is
**not** a shipment status: Bol failure keeps the row at
`pending_bol_confirmation` with `last_error` set and the confirm outbox
row retrying.

### 5.2 `channel_shipment_events`

Append-only per-tenant audit of every state transition (who, when, from,
to, source = `worker | inbound_sync | operator`). Same redaction rules
as Phase 4 M1 `channel_api_audit`.

### 5.3 Enforcement of the launch constraint in DB

Add a `channel_connections.live_authorized_at timestamptz` column,
NULL by default. `p4_dispatch_decision` (from M4) is amended so:

- `mode = 'live'` **requires** `live_authorized_at IS NOT NULL`.
- Setting `live_authorized_at` requires calling a new
  `authorize_channel_live(company_id, channel_account_id, note)` RPC
  restricted to `service_role` **and** guarded by a boolean env flag
  (`P4_LIVE_AUTHORIZATION_ENABLED`) that is `false` in this migration.

Net effect: no live path can execute in this environment even if an
operator toggles `mode = 'live'` — the decision function short-circuits
to `deferred`.

---

## 6. RPCs (all `service_role` unless noted)

1. `record_internal_ship_and_enqueue_confirmation(
       company_id, channel_account_id, order_line_id,
       fulfilment_task_id, transporter_code, track_and_trace)`
   — **the §2 atomic step.** In one transaction:
   (a) posts the Phase 2 inventory transaction that consumes the
   reservation and marks the fulfilment task `shipped`;
   (b) inserts / updates `channel_shipments` to
   `pending_bol_confirmation` with `shipped_at = now()`;
   (c) inserts one `shipment_outbox_events` row with
   `event_kind = 'bol.shipment.confirm'`.
   All-or-nothing. Replay for the same `channel_shipment_id` is a no-op
   at every step (§8 test 3).
2. `record_channel_shipment_accepted(shipment_id, process_status_id, bol_shipment_id?)`
   — called by worker after Bol returns 202 + processStatusId. Does not
   change the `channel_shipments.status`; only stores identifiers.
3. `record_channel_shipment_bol_confirmed(shipment_id, external_ref)`
   — called by worker on Bol `SUCCESS`. Advances
   `pending_bol_confirmation → bol_confirmed`, sets
   `bol_confirmed_at`. Completes the confirm outbox event. Only after
   this does the order line become eligible to close (§2).
4. `record_channel_shipment_bol_failure(shipment_id, error)`
   — called by worker on Bol `FAILURE` or transient exhaustion of
   retries. Leaves `channel_shipments.status = 'pending_bol_confirmation'`.
   Ledger, task, reservation are NOT touched. The confirm outbox event
   is retried by the standard shipment-outbox backoff, or parked in the
   shipment DLQ on exhaustion.
5. `ingest_bol_shipment_status(company_id, channel_account_id, bol_shipment_id, status, event_time)`
   — inbound: records `delivered` / `returned`. Idempotent by
   `(bol_shipment_id, status, event_time)`.
6. `cancel_channel_shipment_pre_handover(shipment_id, reason)`
   — only if `channel_shipments.status = 'draft'`. Rejected with a
   typed error otherwise. Present only if the §3.3 documentation gate
   passes; otherwise this RPC is not created and cancel is deferred.

Read-side helper (`authenticated`, RLS): `list_channel_shipments(company_id, filters)`.

---

## 7. Worker (adapter) additions

Extend `src/lib/outbox/bol-worker.ts` (M4) with a **second claim loop**
targeting `shipment_outbox_events` (not `outbox_events`). Shipment events
never share a claim batch with listing events, and neither loop can
starve the other.

Shipment writes only run in the `p4_dispatch_decision` `shadow` or
`live` paths, and `live` is gated by §5.3, which stays off in M5.

Adapter changes (`src/lib/outbox/bol-adapter.ts`):
- `plan()` gains a case for `bol.shipment.confirm` returning the
  documented Bol shipment-confirmation shape for both v10 and v11
  (media type / method matched to the M4 version-aware plan).
- If the §3.3 documentation gate passes, `plan()` also handles
  `bol.shipment.cancel`; otherwise that case throws
  `unsupported event_type` — the same permanent failure classification
  used elsewhere.
- Terminal detection reuses the HATEOAS `links[].href` follow logic
  from M4.
- Adapter unit tests cover both versions and both event kinds actually
  enabled.

---

## 8. Test plan and acceptance

`scripts/phase4-m5-tests.ts` — DB integration suite. Target: all green,
no reruns, before closure. Coverage grouped by the review's mandatory
tests plus the general M5 suite.

**Mandatory tests from review (BINDING — must all be present and green):**

1. **Bol FAILURE / timeout after internal ship does not reverse ship.**
   Post internal ship via §6.1. Simulate Bol `FAILURE` and, separately,
   process-status polling timeout. Assert: Phase 2 inventory ledger row
   is unchanged, `fulfilment_tasks.status = 'shipped'`, no re-reservation
   row created, `channel_shipments.status = 'pending_bol_confirmation'`,
   confirm outbox row scheduled for retry with backoff.
2. **Two shipments for the same offer are independent.** Create two
   distinct `channel_shipments` A and B against the same
   `(company_id, channel_account_id, offer_id)` in the same run.
   Assert: both own their own `shipment_outbox_events` row, both can be
   `in_flight` concurrently (they differ on `channel_shipment_id`),
   completing A does not affect B, failing B does not affect A. Assert
   that the Phase 3 listing `outbox_events` table gained zero rows
   during this test.
3. **Replay of §6.1 for the same `channel_shipment_id` is a no-op.**
   Call `record_internal_ship_and_enqueue_confirmation` five times with
   identical inputs. Assert exactly one Phase 2 inventory transaction
   posted, one `channel_shipments` row, one `shipment_outbox_events`
   row, one fulfilment-task transition.
4. **Cancel after handover is rejected with no rollback.** With
   shipment in `pending_bol_confirmation`, call
   `cancel_channel_shipment_pre_handover` (or, if that RPC is not
   present per §3.3, call the shipment-outbox path that would enqueue
   `bol.shipment.cancel`). Assert: typed error returned, no row
   modified, no outbox row inserted, ledger untouched.

**General M5 suite:**

- Tenancy: 8+ assertions. Cross-tenant reads/writes rejected. Composite
  FKs prevent mixing tenants across shipment ↔ order-line ↔ task.
- §6.1 atomicity: partial failure inside the transaction leaves zero
  rows across all three tables.
- Worker in `read_only`: no HTTP call, event stays `pending`.
- Worker in `shadow`: `channel_shadow_dispatches` row appended, no
  live HTTP, `shipment_outbox_events` row completes locally.
- Worker in `live` **without `live_authorized_at`**: dispatch decision
  returns `deferred`; event moves back to `pending`; no HTTP.
- Worker in `live` with `live_authorized_at` **but**
  `P4_LIVE_AUTHORIZATION_ENABLED=false`: identical behaviour to the
  previous case. Belt-and-braces test for the launch constraint.
- `record_channel_shipment_bol_confirmed` under advisory lock:
  concurrent calls with the same `shipment_id` produce exactly one
  transition and one order-line close attempt.
- `ingest_bol_shipment_status` idempotency: same event replayed 5×
  yields exactly one `delivered` transition.
- Order line close requires both sides: neither Phase 2 alone nor Bol
  alone advances the order line to its closed state.
- Kill switch: kills new shipment dispatches immediately; existing
  in-flight rows are not force-closed and their `shipped_at` is not
  cleared.
- Regression: full Phase 1 (40), Phase 2 (153), Phase 3 (122), Phase 4
  M1–M4 counts unchanged.

Target result line: `===== Phase 4 M5 — N/N passed, 0 failed =====`
where N ≥ 70. Exact N locked before running.

Adapter unit tests: extended to cover the `bol.shipment.confirm` plan
shape for both v10 and v11. Target: existing 37 + shipment coverage →
new total committed before run.

**No Bol Demo smoke run is required for M5.** The M4 demo smoke already
proved OAuth + PUT transport; Bol Demo's mocked-PENDING behaviour means
running shipment confirm against it would not add new evidence. If a
real tenant becomes available later under the §0 gate, that run is done
outside this migration.

---

## 9. Acceptance criteria (executive)

M5 is **closed** when, and only when:

1. All DDL applied cleanly, no `supabase linter` regressions.
2. `phase4-m5-tests.ts`: N/N passed, 0 failed, on a real run (not a
   re-run of stale output). All four mandatory review tests (§8.1–8.4)
   present and green.
3. Regression: Phase 1 + Phase 2 + Phase 3 + Phase 4 M1–M4 suites all
   still green on the same execution. The Phase 3 listing
   `outbox_events` table's schema, indexes, and one-in-flight rules are
   byte-identical to the M4 baseline.
4. `live_authorized_at` is NULL on every existing `channel_connections`
   row and no code path in the diff can set it without invoking
   `authorize_channel_live`, which itself is disabled by the env flag.
5. `PHASE4_M5_CLOSURE_REPORT.md` records the total assertion count,
   the launch constraint verbatim, which §3.3 branch was taken
   (cancel included vs deferred), and confirms no live writes were
   emitted.

Nothing in M5 grants live authorization. That remains a separate,
explicit, human-in-the-loop decision per §0.
