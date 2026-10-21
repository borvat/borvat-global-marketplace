# ADR-002 — GitHub preparation branch as reviewable source authority

Status: proposed for owner review, 2026-10-22.

Decision: recover unchanged Lovable text into apps/marketplace with exact source SHA/hash manifest. Keep published Lovable application, database, original git branches and historical decisions unchanged. Preserve the independent core-engine and product-completion code under experiments, with explicit non-production status. main remains untouched. Approval of this import PR would establish the reviewed GitHub source baseline; it is not yet approved or functionally complete.

Reason: main was docs-only but non-main branches contain substantial work. Replacing them blindly would lose context, while selecting an alternate engine without parity tests would change product direction. A snapshot import preserves recoverable source without pretending to have recovered original Git history, credentials, database rows or binary assets.

Consequence: 69 binary files remain blocked; source parity is partial at asset level and full only for the 499 eligible text files. The app is not portable/launch-ready until binaries, lock selection, clean build and isolated DB replay are proven. Original .env is excluded, never read. Record tooling changes separately from original text.

Rollback: close/abandon prep PR/branch; no original branch/Lovable/database was changed. Do not force-push or rewrite published history.
