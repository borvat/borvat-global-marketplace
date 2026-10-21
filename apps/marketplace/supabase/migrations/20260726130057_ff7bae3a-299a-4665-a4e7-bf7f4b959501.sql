DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname='place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    END IF;
  END LOOP;
END $$;