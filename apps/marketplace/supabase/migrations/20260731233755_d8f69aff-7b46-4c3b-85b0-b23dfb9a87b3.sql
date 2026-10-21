BEGIN;

REVOKE ALL ON TABLE public.channel_connections_safe FROM anon, authenticated, PUBLIC;

GRANT SELECT ON TABLE public.channel_connections_safe TO authenticated;

DO $$
DECLARE
  v_anon_write   int;
  v_auth_ttr     int;
  v_anon_objects int;
  v_nonrel       int;
BEGIN
  SELECT count(*) INTO v_anon_write
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon'
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES');

  SELECT count(*) INTO v_auth_ttr
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='authenticated'
    AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');

  SELECT count(DISTINCT table_name) INTO v_anon_objects
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon';

  SELECT count(*) INTO v_nonrel
  FROM information_schema.role_table_grants g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE g.table_schema='public'
    AND g.grantee IN ('anon','authenticated')
    AND c.relkind <> 'r'
    AND g.privilege_type <> 'SELECT';

  IF v_anon_write > 0 THEN
    RAISE EXCEPTION 'P0-1a FAIL: anon retains % write grant(s).', v_anon_write;
  END IF;
  IF v_auth_ttr > 0 THEN
    RAISE EXCEPTION 'P0-1a FAIL: authenticated retains % TRUNCATE/TRIGGER/REFERENCES.', v_auth_ttr;
  END IF;
  IF v_anon_objects > 6 THEN
    RAISE EXCEPTION 'P0-1a FAIL: anon reaches % objects, expected 6.', v_anon_objects;
  END IF;
  IF v_nonrel > 0 THEN
    RAISE EXCEPTION 'P0-1a FAIL: % non-SELECT grant(s) remain on views/other relations.', v_nonrel;
  END IF;

  RAISE NOTICE 'P0-1a PASS: anon writes=0, anon objects=%, auth TRUNCATE/TRIGGER/REFERENCES=0, view non-SELECT grants=0.', v_anon_objects;
END $$;

COMMIT;