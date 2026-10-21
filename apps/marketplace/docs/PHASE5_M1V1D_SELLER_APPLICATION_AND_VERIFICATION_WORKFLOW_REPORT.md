# PHASE 5 — M1V-1D

## SELLER APPLICATION AND VERIFICATION WORKFLOW — CLOSURE REPORT

Status: **COMPLETE — CLOSED**
Scope: seller application intake, platform-admin verification review, and the
two authorisation surfaces that expose them.
Live effects: none. No store published, no product published, no payment,
no settlement, no channel/Bol activation, no "Verified seller" badge.

---

## 1. WHAT WAS DELIVERED

### 1.1 Storage layer (already applied — M1V-1D BUSINESS DDL)

| Object | Purpose |
| --- | --- |
| `public.seller_applications` | one application per legal company (`sa_company_unique`) |
| `public.seller_application_events` | append-only audit trail of every state change |

- Seven authorised states: `draft`, `submitted`, `in_review`,
  `information_required`, `approved`, `rejected`, `suspended`.
- RLS **enabled and forced**, **zero policies**, **zero table privileges** for
  `anon`, `authenticated`, `service_role`, `sandbox_exec`. The tables are an
  RPC-only surface.
- Write guard `m1v1d_guard_application_write` enforces the state machine and
  makes review metadata administrator-owned: no client can supply
  `approved_at`, `decided_by`, or any decision reason.
- `m1v1d_application_event_immutable` blocks UPDATE and DELETE on the trail.

### 1.2 Authorised RPC surface (exactly six, `authenticated` only)

Seller side (membership-scoped): `seller_get_application`,
`seller_upsert_application`, `seller_submit_application`.
Admin side (platform-admin only): `admin_list_seller_applications`,
`admin_get_seller_application`, `admin_review_seller_application`.

All six are `SECURITY DEFINER` with a pinned `search_path`. None is executable
by `anon`, `service_role` or `sandbox_exec`.

### 1.3 UI layer (this cycle)

| File | Role |
| --- | --- |
| `src/hooks/useSellerApplication.ts` | RPC-only data layer + error-code translation |
| `src/routes/_authenticated/seller.onboarding.tsx` | seller: prepare → submit |
| `src/routes/_authenticated/admin/seller-applications.tsx` | admin: review queue + decision drawer |
| `src/routes/_authenticated/admin/route.tsx` | page metadata + `REAL READ-ONLY` classification |
| `src/components/demo/shell.tsx` | navigation entries for both workspaces |

No component touches a table directly; every read and write is an RPC call.

---

## 2. SEPARATION OF THE TWO CAPACITIES

`ceo@suroohholdings.com` holds **two independent capacities**, granted by two
independent mechanisms:

1. **Seller company owner** — membership of `Qnan B.V.` in
   `public.company_members`. Grants access to `/seller/*` for that company only.
2. **Borvat platform administrator** — the `admin` row in `public.user_roles`
   (the single platform admin, provisioned in M1A-M2D1C). Grants access to
   `/admin/*`.

Neither capacity implies the other, and the workflow refuses to let them meet:
`admin_review_seller_application` raises `self_review_forbidden` when the
reviewer is a member of the applicant company (proved live, test T13). Approval
of Qnan B.V. therefore **cannot** be performed by this account and requires a
second, independent platform administrator — an owner decision, not a
technical one. This is recorded as the single open item in §6.

---

## 3. RUNTIME SECURITY TESTS — 14/14 PASS

Harness: `scripts/phase5-m1v1d/runtime-security-tests.py` (live project, real
HTTP, three identities: anonymous, a throwaway plain `authenticated` account
created and deleted by the harness, and the live owner/admin session). The
service key was used **only** to create and delete the throwaway account; it
never called an M1V-1D RPC and granted that account no role or membership.

| # | Test | Result |
| --- | --- | --- |
| T01 | anon cannot execute `admin_list_seller_applications` | PASS — `permission denied for function` |
| T02 | anon cannot execute `admin_get_seller_application` | PASS — `permission denied for function` |
| T03 | anon cannot execute `admin_review_seller_application` | PASS — `permission denied for function` |
| T04 | non-admin authenticated cannot list applications | PASS — `not_platform_admin` |
| T05 | non-admin authenticated cannot read an application | PASS — `not_platform_admin` |
| T06 | non-admin authenticated cannot review an application | PASS — `not_platform_admin` |
| T07 | non-member cannot read another company's application | PASS — `not_authorised` |
| T08 | non-member cannot write another company's application | PASS — `not_authorised` |
| T09 | both tables unreadable over the data API (anon + authenticated) | PASS |
| T10 | platform admin **can** list applications (positive path) | PASS — HTTP 200 |
| T11 | seller owner can create/update its **own** draft | PASS — status `draft`, event logged |
| T12 | submission blocked without an approved-grade legal identity | PASS — `legal_identity_incomplete` |
| T13 | platform admin cannot review his own company's application | PASS — `self_review_forbidden` |
| T14 | unknown/illegal review action never executes for a non-admin | PASS — `not_platform_admin` |

Verdict line: `total=14 pass=14 fail=0 — M1V-1D RUNTIME GATE: PASS`.

### 3.1 Static assertions — 23/23 PASS

`scripts/phase5-m1v1d/static-assertions.sh` → `M1V-1D STATIC GATE: PASS`
(scope, uniqueness, state set, RLS forced, zero policies, zero privileges,
append-only trail, guard triggers, locked internals, six-RPC surface,
SECURITY DEFINER + pinned `search_path`, self-review block, admin checks,
membership checks, administrator-owned review metadata, storage-layer state
machine, submission preconditions, mandatory reasons, decision provenance,
no PII leakage into the storefront read, runtime deny proof).

### 3.2 UI authorisation proof (headless browser, live sessions)

| Identity | Route | Observed |
| --- | --- | --- |
| Platform admin | `/admin/seller-applications` | renders **Seller applications — Verification review queue (real data)** |
| Seller owner | `/seller/onboarding` | renders the application form, status `Draft`, "Legal identity: draft" |
| Plain authenticated (no admin role) | `/admin/seller-applications` | **"Access denied — This area is restricted to Borvat platform administrators."** |

---

## 4. ACL GATE AND A REPAIRED REGRESSION

### 4.1 M1B-0T — repaired storefront regression (critical)

An earlier drift normalisation had revoked `EXECUTE` on `public.has_role` from
`anon` and `authenticated`. RLS policy expressions are evaluated with the
privileges of the querying role, so every storefront read of `products` failed
with `permission denied for function has_role` (HTTP 403). `EXECUTE` was
restored to both roles and `has_role(uuid,app_role)` is now an explicitly
justified entry in `scripts/phase5-acl-gate/approved-routines.json`.
Verified after the fix: anonymous `GET /rest/v1/products` → **HTTP 200** with
rows. Decision **BOR-DEC-143**.

### 4.2 M1B-0U — ACL drift cycle 13 (REVOKE-only)

The platform re-granted `SELECT, INSERT` to `sandbox_exec` on all eleven
M1C-1E-*/M1V-1D tables and `EXECUTE` on their guard routines. Migration
**M1B-0U** is REVOKE-only (no DDL, no data change) and strips every
`sandbox_exec` privilege on tables, sequences and routines in `public`.

Gate result after the fix: `ACL GATE: PASS` — 64 assertions, 0 failures,
including the runtime deny proofs on the delivery-destination, manual-quote and
seller-application scopes.

---

## 5. GOVERNANCE STATE (UNCHANGED PROHIBITIONS)

Qnan B.V. remains an operational tenant that is **not** a legally verified
seller. Still prohibited and still technically blocked:

- Verified-seller badge — no application has reached `approved`.
- Publication of the IBBO store (`merchant_store_public_profiles.ibbo` =
  `draft`) and of any product.
- Payments, settlement, Bol or any channel live mode.

Data state at closure: 1 company legal identity (`Qnan B.V.`, `draft`),
2 identifiers (KvK `91138906`, VAT `NL865563251B01`, both `active`),
1 store (`ibbo`, `draft`), 1 public profile (`ibbo`, `draft`),
1 seller application (`Qnan B.V.`, `draft`, created by the seller owner during
test T11).

---

## 6. OPEN ITEMS FOR THE OWNER

1. **A second platform administrator is required** before Qnan B.V. can be
   approved. Self-review is structurally impossible by design; this is not a
   defect and must not be worked around by relaxing the guard.
2. Legal identity verification (`company_legal_identities.verification_status`
   = `draft`) must be completed before the application becomes submittable.

---

## 7. DECISIONS APPENDED

- **BOR-DEC-142** — the M1V-1D RPC surface is `authenticated`-only and is the
  sole access path to the seller application tables; the tables carry zero
  policies and zero privileges.
- **BOR-DEC-143** — `public.has_role(uuid, app_role)` MUST retain `EXECUTE` for
  `anon` and `authenticated`. It is called from RLS policy expressions, which
  are evaluated with the caller's privileges; revoking it breaks all
  policy-protected reads. Recorded as an approved routine with a written
  justification in the ACL gate allowlist.
- **BOR-DEC-144** — administrator self-review is prohibited at the storage and
  RPC layer. Approving a company the reviewer belongs to requires a second,
  independent platform administrator appointed by the owner.

---

## 8. VERDICT

**M1V-1D: PASS.** Static gate 23/23, runtime security tests 14/14, ACL gate
64/64, UI authorisation proven for all three identities, storefront regression
repaired and verified. No live commerce capability was enabled.
