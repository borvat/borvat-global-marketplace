# Phase 5 — M0-E2 — Structural Diff (FINAL)

**Status:** PENDING — external clean-room replay not yet executed.

This document supersedes `docs/phase5-m0/structural-diff.md` once M0-E2
produces a scratch-DB schema inventory.

## Required content (to be filled after external replay)

For each object class listed in the owner spec (§2C), the diff MUST enumerate:

| Class | Live-only | Scratch-only | Divergent | Classification |
|---|---|---|---|---|
| Tables | | | | |
| Columns | | | | |
| Types | | | | |
| Functions (signature) | | | | |
| Function bodies | | | | |
| Function ACLs | | | | |
| RLS policies | | | | |
| Table grants | | | | |
| Indexes | | | | |
| Constraints (CHECK/FK/UNIQUE/PK) | | | | |
| Triggers | | | | |
| Views | | | | |
| Sequences | | | | |
| Migration history rows | | | | |

Each row must be classified as one of:

- `EXPECTED` — explained by an approved migration or Owner Decision.
- `UNDOCUMENTED` — requires new Owner Decision before acceptance.
- `DANGEROUS` — blocks baseline; forces `BASELINE FAIL`.

## Known carry-over from `structural-diff.md`

The ACL drift on `public.place_order` documented in the earlier structural
diff was **closed by P5-HF-001**. It is expected to appear in the
`scratch-only` column when comparing pre-hotfix scratch replay vs. live,
and to be **absent** when comparing current-manifest scratch replay vs. live.

Any residual drift beyond that closure is a new finding.
