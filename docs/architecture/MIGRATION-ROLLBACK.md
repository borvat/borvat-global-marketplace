# Safe migration and return plan

1. Snapshot source by immutable commit/hash only; do not export production data/secrets. Preserve all original branches and Lovable publication.
2. Recover binary bytes via an authorized complete export/real connected Git repository. Compare file counts and hashes. Never write lossy binary read_file output, create placeholder originals or infer asset parity from a passing compile.
3. Reproduce dependencies in disposable workspace. Choose one authoritative lock manager and pin toolchain after review; original npm lock currently stale. Keep original and candidate diffs; no silent framework upgrade.
4. Derive migration dependency list and safe local baseline. Historical migrations include 162-company fixture purge and trigger disable operations; quarantine those as environment-specific, not generic fresh DB setup. Reconcile actual schema/RLS/role differences before any schema change. No live DB credentials in CI.
5. Replay approved schema only into a disposable local PostgreSQL/Supabase service, run ACL failure injection, tenant denies, FK/quantity/rounding and restart/restore checks. No current container/PostgreSQL runtime available locally: NOT_RUN, never implied pass.
6. Later approved staging import uses synthetic data, explicit host allowlist and separate PSP test accounts. No DNS changes or traffic cutover here. Visual and functional parity require same routes and golden journeys with explicit disabled/demo classification.
7. Production transfer is a separate owner-approved cutover plan with backups, maintenance/dual-read strategy, invariant reconciliation and rollback window. This preparation does not authorize it.

Current rollback is simply abandoning the new PR/branch. For future database mutations prefer forward fixes and provider/domain compensations; do not replay down migrations or overwrite financial history. Restore drills must prove RPO/RTO; do not promise them based on host marketing.
