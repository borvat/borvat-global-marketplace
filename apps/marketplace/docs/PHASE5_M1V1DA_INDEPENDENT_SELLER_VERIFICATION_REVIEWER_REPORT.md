# PHASE 5 — M1V-1D-A — INDEPENDENT SELLER VERIFICATION REVIEWER

Date: 2026-07-27
Scope: least-privilege reviewer role, governed decision surface, separate reviewer workspace.
Status: **GOVERNANCE BLOCKER — NO INDEPENDENT HUMAN REVIEWER AVAILABLE**

---

## 1. Verdict

| Candidate verdict | Applies |
| --- | --- |
| M1V-1D-A PASS — INDEPENDENT REVIEWER PROVISIONED | No — no real human identity supplied yet |
| PARTIAL — SECOND FULL PLATFORM ADMIN REQUIRED BY CURRENT RBAC | No — a narrower role was possible and was implemented |
| SECURITY BLOCKER — REVIEWER CAN APPROVE RELATED COMPANY | No — blocked by `self_review_forbidden` |
| **GOVERNANCE BLOCKER — NO INDEPENDENT HUMAN REVIEWER AVAILABLE** | **Yes** |

The technical capability is complete and least-privilege. It is intentionally unassigned:
no person has been named, so no account was created and the Qnan B.V. application was
**not** reviewed, started, approved, rejected or otherwise touched.

---

## 2. What was implemented

### 2.1 Dedicated role (no full platform admin)

`public.app_role` gained the value `seller_verification_reviewer`. Roles remain stored
exclusively in `public.user_roles` — never on `profiles` or any company table.

### 2.2 Narrow gate

New security-definer gate `public.m1v1da_require_reviewer()` returns the caller id plus the
caller's actor role, accepting **platform admin OR verification reviewer** and raising
`not_verification_reviewer` (42501) otherwise. It is used by exactly three routines:

- `admin_list_seller_applications`
- `admin_get_seller_application`
- `admin_review_seller_application`

Every other `admin_*` routine (stores, borvat-direct accounts, draft listings, etc.) still
calls `m1v1d_require_admin()` and is unreachable for a reviewer.

Reviewer authority therefore covers: list applications, read one application, start review,
request information, approve, reject, suspend, reinstate, read immutable history.
Reviewer authority explicitly excludes: products, inventory, orders, prices, channels,
payments/payouts, platform user management, security/ACL, direct company or store edits.

### 2.3 Self-review remains prohibited

`admin_review_seller_application` evaluates `public.is_company_member(company_id, auth.uid())`
before any transition and raises `self_review_forbidden` (42501). This runs for reviewers and
platform admins alike. No bypass flag, no service-role path, no UI escape hatch was added.

### 2.4 Immutable events record the real actor

`seller_application_events.actor_role` and `seller_verification_events.actor_role` now accept
`seller_verification_reviewer`, and the decision routine writes the caller's actual role rather
than a hardcoded `platform_admin`. One decision still produces exactly one event row; the event
tables stay append-only.

### 2.5 Role-grant governance

`guard_user_roles_mutation` treats `admin` and `seller_verification_reviewer` as privileged:
only an existing platform admin may insert/modify/remove them, and nobody may grant or remove a
privileged role for themselves. Last-platform-admin protection is unchanged.

### 2.6 Separate reviewer workspace

`/review/seller-applications` (`src/routes/_authenticated/review/`) is a standalone workspace
gated on `has_role(admin)` OR `has_role(seller_verification_reviewer)`. The reviewer never enters
`/admin/*`, which stays admin-only; the shared queue UI lives in
`src/components/review/seller-applications-panel.tsx` and is reused by both routes.

---

## 3. Security position

| Requirement | State |
| --- | --- |
| Qnan owner cannot approve Qnan | Enforced (`self_review_forbidden`), unchanged from M1V-1D |
| Reviewer can only decide through the governed RPC | Enforced — tables are RPC-only, no direct write grants |
| Reviewer cannot approve a company they belong to | Enforced by the same guard |
| Reviewer cannot reach unrelated admin functions | Enforced — other RPCs keep `m1v1d_require_admin()`; `/admin/*` gate unchanged |
| Every decision creates one immutable event | Enforced, now with the true actor role |
| No shared credentials, no bypass flags | None introduced |
| Live-authorized channels | 0 — untouched |
| Qnan approval | NOT performed |
| IBBO publication / checkout / payouts / bol.com / imports | All still blocked |

Runtime proof of the reviewer path (reviewer approves an unrelated company, reviewer is refused
on their own company, reviewer is refused on unrelated admin RPCs) requires a real reviewer
account and is deferred to the provisioning step below.

---

## 4. What is required from the owner to close M1V-1D-A

A single decision: the **full name and personal work e-mail of the real, independent human**
who will act as Borvat seller verification reviewer.

That person must be:

- a separate real human with a separate, non-shared login;
- not the Qnan owner and not a second account of the same person;
- not a member, owner or administrator of Qnan B.V. or IBBO;
- MFA-enabled before any production approval;
- explicitly assigned and auditable.

On receipt, the next step provisions the account, grants `seller_verification_reviewer` (admin
action, never self-granted), runs the runtime security proof, and only then lets that reviewer
check KvK 91138906 and VAT NL865563251B01 and record an explicit decision on Qnan.

---

## 5. Decisions appended

BOR-DEC-145, BOR-DEC-146, BOR-DEC-147, BOR-DEC-148 in `docs/BORVAT_DECISION_LOG_V1.md`.
