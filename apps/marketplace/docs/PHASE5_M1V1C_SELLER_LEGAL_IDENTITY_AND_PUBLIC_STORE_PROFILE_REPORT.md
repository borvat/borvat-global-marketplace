# PHASE 5 — M1V-1C
## Seller Legal Identity, Verification and Public Store Profile Foundation

Date: 2026-07-26
Authorization: M1V-1C (owner-approved spec)
Verdict: **PASS**

---

## 1. Preflight

| Check | Result |
| --- | --- |
| `merchant_stores` carries legal identifiers | NO — only operational metadata (confirms R-P1) |
| `company_tax_profiles` exists | YES — tax-only, not a legal identity model |
| Existing legal identity / public profile tables | NONE |
| Qnan products / offers / inventory / listings | 0 / 0 / 0 / 0 |
| Live-authorized channel accounts (platform-wide) | 0 |
| Qnan channel account state | `paused` / `draft` |

Qnan B.V. `8069c727-…f7`, IBBO store `2aec4c37-…1b`. No duplicate entity risk.

---

## 2. Security normalization (before and after business DDL)

Platform re-grant drift (R-T21) was detected twice this cycle:

- **M1B-0Q** — ACL Drift Cycle 10 (REVOKE-only): `sandbox_exec` had regained read/execute on
  internal shipping and manual-quote objects.
- **M1B-0R** — ACL Drift Cycle 11 (REVOKE-only): after the M1V-1C DDL the platform re-granted
  broad EXECUTE/table privileges again, including on `place_order` and on the new M1V-1C tables.

Both are REVOKE-only, forward-fix, no business change. After M1B-0R the approved surface was
re-affirmed explicitly (seller RPCs to `authenticated`, `public_get_store_profile` to `anon`).

**ACL GATE: PASS** — run twice, both clean.

---

## 3. Business DDL

| Object | Purpose |
| --- | --- |
| `public.company_legal_identities` | Legal entity + registration country + verification lifecycle |
| `public.company_legal_identifiers` | Typed identifiers (KvK / VAT / EORI), globally unique while active |
| `public.merchant_store_public_profiles` | Public storefront data, unique `public_slug`, visibility state |
| `public.seller_verification_events` | Append-only, immutable verification trail |

Guards: `m1v1c_guard_legal_identity_write`, `m1v1c_guard_identifier_write`,
`m1v1c_guard_store_profile_write`, `m1v1c_guard_verification_event_immutable`.
All tables: RLS forced, zero policies, zero application grants — access only through RPC.

RPC surface: `seller_get_legal_identity`, `seller_upsert_legal_identity`,
`seller_upsert_legal_identifier`, `seller_submit_legal_identity`,
`seller_get_store_public_profile`, `seller_upsert_store_public_profile` (all membership-scoped,
`authenticated` only) and `public_get_store_profile(text)` (`anon`, read-only, published+approved only).

---

## 4. Recorded data (no invented values)

| Field | Value |
| --- | --- |
| Legal name | Qnan B.V. |
| Registration country | NL |
| KvK | 91138906 |
| VAT | NL865563251B01 |
| Identity status | `draft` |
| IBBO public profile | `draft` |
| Verified seller badge | NOT granted |

---

## 5. Verification evidence

| Assertion | Result |
| --- | --- |
| Static assertions (RLS forced, no policies, no app grants, unique indexes, guards locked) | 22/22 PASS |
| Duplicate KvK insert | REJECTED `23505` |
| Duplicate VAT insert | REJECTED `23505` |
| Seller self-approval to `approved` | REJECTED by guard |
| Publish store with unapproved identity | REJECTED by guard |
| Edit/delete a verification event | REJECTED by guard |
| Anon `public_get_store_profile('ibbo')` | `null` (draft correctly hidden) |
| Anon `seller_get_legal_identity` | `42501` permission denied |
| ACL gate (twice) | PASS / PASS |

---

## 6. UI surface

One reserved public route: `/store/$slug`, backed by a public server function that calls
`public_get_store_profile`. Until an admin approval exists it renders the neutral
**"Winkel komt binnenkort"** state. The verified badge is rendered strictly from the
server-derived flag; it cannot be forged client-side. No seller contact details are rendered.

No product publication, pricing, payment, settlement or channel activity was introduced.

---

## 7. Residual risks

- **R-P1** — `merchant_stores` intentionally holds no KvK/VAT; identifiers are normalized.
- **R-V1** — No admin verification UI yet; approval remains a governed manual action.
- **R-V2** — `/store/$slug` shows "coming soon" for every slug until a first approval.
- **R-T21** — Platform ACL re-grant drift recurs after every migration; each cycle needs a new
  REVOKE-only normalization. Now at cycle 11.

---

## 8. Prohibitions still in force for Qnan / IBBO

Verified-seller badge, public store publication, product publication, payments, settlement,
and any Bol or channel live activity remain **blocked**.
