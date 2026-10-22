# ADR-006: independent local verification and final blocker disposition

Status: proposed / review required. Inherits accepted research at `44228fbf911b83e108a69183ea1ab18d5d8d878a`; does not replace source or approve Mercur adoption.

Use a clean pinned disposable install and actual runtime resolution assertions, rather than inferring security from lockfile content. Preserve native payout evidence after ambiguous provider/SQL outcomes and reject explicit ambient transaction coupling. Keep a lookup-first durable Surooh recovery coordinator outside the core where possible; native integration remains a blocker.

G0 status is **HOSTED_CI_BLOCKED — ALTERNATIVE_VERIFICATION_REQUIRED**. GitHub remains the source/review system; local isolated PostgreSQL/build/auth/concurrency/recovery evidence, input hashes, commands and exits establish test results. Hosted CI failure is retained, never reclassified as application failure or success. No billing fix/repeated hosted rerun is required for local evidence review. This does not grant execution, merge or production authority.

H07 and native record-retention counterexamples pass the new isolated tests. The whole native financial coordinator, dependency exposure disposition, all native job authority boundaries, original binary assets/build/lint and native operational restore remain open. Final foundation and C1 execution remain HOLD. See [report](../blocker-resolution/REPORT.md), [tasks](../blocker-resolution/FUTURE-TASKS.md) and [gate](../../experiments/blocker-resolution/verify-evidence.mjs).
