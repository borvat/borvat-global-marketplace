# M1V-0A — OWNER VISUAL REVIEW HANDOFF

Verdict on delivery: **VISIBLE ALPHA DELIVERED FOR OWNER REVIEW**

Scope of this handoff: presentation only. No DDL, no DML, no RPC, no backend, no schema change, no new phase started (M1C-1E-F, messaging backend and checkout are NOT started).

---

## 1. Preview access

- Preview URL: https://id-preview--092a5ea2-1dc1-4ffd-a4b4-efe2d3237298.lovable.app
- Login: sign in with your normal Borvat account through `/auth` (the same account you already use in the preview).
- No demo account and no role selector is required. All M1V-0A screens read **frontend fixtures only**, so they render identically for any signed-in user. The routes live under the authenticated layout purely so they are not publicly indexable.
- If a screen redirects to `/auth`, sign in and re-open the link.

## 2. Direct links (append to the preview URL)

Seller Manager
- Dashboard: `/seller/manager`
- Store: `/seller/store`
- Products / Catalog: `/seller/catalog`
- Inventory: `/seller/inventory`
- Shipping: `/seller/shipping`
- Manual Quotes: `/seller/quotes`
- Messages (Borvat ↔ merchant): `/seller/messages`

Borvat Admin
- Dashboard: `/admin/dashboard`
- Companies: `/admin/companies`
- Products: `/admin/products`
- Shipping: `/admin/shipping`
- Quotes: `/admin/quotes`
- Security: `/admin/security`

Customer Service
- Customer inbox: `/support/inbox/customers`
- Merchant inbox: `/support/inbox/merchants`
- Case bridge (both channels side by side): `/support/cases/case_1001` (also `case_1002`, `case_1003`)

Customer support view (buyer side)
- Overview: `/account/support`
- Conversation: `/account/support/cnv_c1`

## 3. Data classification, per screen

Every manager screen now renders a classification chip under the demo banner, so the label is visible **inside the interface**, not only in this report.

| Screen | Classification |
| --- | --- |
| All Seller Manager screens (`/seller/*` in M1V-0A) | DEMO DATA |
| All Borvat Admin demo screens (`/admin/dashboard`, `companies`, `products`, `shipping`, `quotes`, `security`) | DEMO DATA |
| All Customer Service screens (`/support/*`) | DEMO DATA |
| Customer support view (`/account/support*`) | DEMO DATA |
| Order reference shown on case_1001 (`ORDER-PLACEHOLDER-0001`) | PLACEHOLDER (marked in-screen) |
| Existing production storefront/seller routes outside M1V-0A | unchanged, not part of this review |

No screen in M1V-0A is REAL READ-ONLY: none of them touch the database. The chip component supports `REAL READ-ONLY` and `PLACEHOLDER` so wiring a screen to live reads later only changes one prop.

## 4. Verification performed

Automated browser pass over all 18 routes, at desktop (1280×1800) and mobile (390×844):

- 18/18 routes render content; **no blank page, no broken route, no redirect loop**.
- **0 page errors** on both viewports.
- Sidebar navigation present on every screen (Seller 11 links, Admin 13, Support 7, Account 4) and every entry resolves to a rendering page.
- Mobile/tablet: the sidebar collapses into a horizontal scrolling nav strip; primary navigation stays usable at 390px width. No horizontal overflow of the page body.
- Typecheck: `tsgo --noEmit` clean.
- Database: zero migrations, zero DML executed in this step.

Screenshots (desktop `d_*`, mobile `m_*`) are attached under `m1v0a-screenshots/`, including all requested shots: seller dashboard, products, inventory, shipping, quote details, seller ↔ Borvat chat, customer ↔ Borvat chat, case bridge, admin dashboard.

## 5. Channel separation confirmed visually

`/support/cases/case_1001` shows the two threads side by side:
- **Customer ↔ Borvat** — visible to the customer.
- **Borvat ↔ Merchant** — internal, never shown to the customer.

There is no UI path anywhere that opens a direct customer↔seller conversation.

## 6. Waiting on Owner

Awaiting Owner feedback on look and flow. No further work will start until the Owner responds.
