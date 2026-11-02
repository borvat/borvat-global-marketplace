-- Custom roles required by BORVAT migrations.
-- `sandbox_exec` is an ACL-drift role present in the production project but never
-- defined in any migration (see 20260724210701_…sql: "undocumented ACL drift
-- discovered during M0-E1 live inspection"). Several migrations REVOKE from it
-- unguarded, so it must exist before migrations run.
CREATE ROLE sandbox_exec NOLOGIN;
