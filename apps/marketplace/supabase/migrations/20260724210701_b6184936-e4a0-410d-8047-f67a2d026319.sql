-- P5-HF-001: Lock down legacy place_order RPC (authorised 2026-07-24 by owner)
-- Evidence: docs/PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md
-- Live ACL before: {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}

REVOKE EXECUTE ON FUNCTION public.place_order(uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- sandbox_exec is undocumented ACL drift discovered during M0-E1 live inspection.
-- Revoke defensively; guarded in case the role is absent in some environments.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.place_order(uuid, integer, jsonb) FROM sandbox_exec';
  END IF;
END$$;

COMMENT ON FUNCTION public.place_order(uuid, integer, jsonb) IS
  'DEPRECATED 2026-07-24 (P5-HF-001). Vulnerable legacy checkout RPC: accepted caller-supplied user_id and total, bypassed Phase 2 canonical inventory. All EXECUTE grants revoked. DO NOT re-grant. Superseded by the Phase 5 canonical commerce order model (pending M3). See docs/PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md and docs/PHASE5_P5_HF_001_REPORT.md.';