# ADR-003 — Preserve modular monolith; defer engine replacement

Status: proposed for owner review.

The useful application is TanStack Start/React/Supabase with existing seller/company RPC, catalog and inventory/outbox foundations. Keep its structure inside apps/marketplace to avoid a speculative code rewrite. Represent domain boundaries through MODULES.md and module-map.json first. Reorganize runtime imports only in later approved, tested domain changes.

Existing Mercur proposal remains an unvalidated alternative, not the selected runtime. Existing PostgreSQL core is a separate tested-in-part candidate, not interchangeable with Supabase Auth/RLS or the Lovable UI. Preserve it without enabling its schema/API or assuming its 12% default commission is a commercial decision.

Run product parity, licence, deployment portability and accounting/payment responsibility comparisons before any engine switch. No framework migration, feature construction or business-logic correction is part of this preparation commit.
