DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public._m1b3c4_verify()'::regprocedure);
  d := replace(d, 'v_res := v_res || ', 'v_res[coalesce(array_length(v_res,1),0)+1] := ');
  d := replace(d, ') INTO r', ') INTO v_bool');
  d := replace(d, 'r::text', 'v_bool::text');
  d := replace(d, '  r record;', '  r record; v_bool boolean;');
  EXECUTE d;
END $mig$;