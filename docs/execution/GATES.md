# Evidence and transition gates

Policy is fail-closed. `policy.json` keeps execution and advancement disabled. Merely closing an issue, a green foundation check, or a successful build cannot advance a stage, trigger Codex or authorize a merge.

For a later phase proposal supply: exact reviewed code commit SHA, stage ID and prerequisites, all required acceptance IDs with commands/results, raw-log paths and SHA256 hashes, zero unexplained P0/P1, and owner approval tied to that exact commit/stage/decision. Approvals expire when the code or scope changes. A sibling human reviewer verifies evidence and GitHub review provenance. The offline checker cannot authenticate a human approval; its HOLD remains until an authorized policy change is separately reviewed.

`gate.mjs` currently always denies advancement when owner authorization is absent. Its tests verify denial for missing/failed/misbound evidence. No workflow calls a merge/deployment API. CI has contents:read only. No Codex agent is assigned to any issue.

**Limit:** main is currently unprotected in GitHub. This branch does not claim server-enforced protection against a repository administrator's manual merge or arbitrary future workflow changes. Branch protection/rulesets and required reviewers need a separate reviewed settings action; no protection/permission setting was changed here. Draft PR plus no auto-merge is the current review boundary.

ADR-005 adds an independent foundation decision before any implementation handoff. `foundation_decision_approved` remains false and the offline gate denies even an otherwise complete Codex authorization/receipt. It must be changed only through a separately reviewed exact-SHA-bound owner decision; that review does not enable Codex by itself. See OSS-REVISED-PLAN.md.
