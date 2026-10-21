# Repository instructions

The owner authorized engineering preparation only. **Do not start, assign or trigger Codex implementation.** All C1–C6 work is ON HOLD until explicit final owner approval. No production access, database migrations, live PSP, real sellers, external messages, paid services, deployment, main merge or auto-merge.

Preserve imported source under apps/marketplace. Read its AGENTS.md and original governance files before any future modification. Do not rewrite pushed history or alter Lovable-connected branches. apps/marketplace .env was intentionally excluded. Never populate examples with real secrets or connect existing cloud databases.

Original migrations include data-dependent destructive fixture purges; do not replay them blindly, even in a fresh database. Use an explicitly local disposable harness and approved migration manifest. Existing tests can create users or use service-role credentials: run only allowlisted isolated tests. Archive experiments are not production APIs.

Before changing a stage, run scripts/foundation/check.mjs and gate.mjs. Tests are necessary but not owner approval. Never turn NOT_RUN/BLOCKED into PASS, weaken a failing check or replace missing original assets with placeholders to claim parity. No agent delegation requested.

Owner follow-up authorizes isolated Mercur hardening/recovery prototypes and evidence updates only. Research and preferred-candidate selection are accepted; final foundation, Codex, implementation stages, main merge and production actions remain unauthorized. Keep Surooh proof code under experiments/mercur-hardening, not apps/marketplace. Do not turn a passing simulated-provider test into native/full-journey certification.
