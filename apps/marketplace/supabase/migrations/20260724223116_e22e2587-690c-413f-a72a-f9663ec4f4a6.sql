CREATE OR REPLACE FUNCTION public.create_borvat_direct_account(
  _merchant_store_id UUID,
  _display_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_store_company UUID;
  v_store_display TEXT;
  v_id UUID;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT company_id, display_name
    INTO v_store_company, v_store_display
    FROM public.merchant_stores
    WHERE id = _merchant_store_id;

  IF v_store_company IS NULL THEN
    RAISE EXCEPTION 'merchant_store not found' USING ERRCODE = '23503';
  END IF;

  IF NOT public._merchant_store_can_manage(v_store_company, v_uid) THEN
    INSERT INTO public.agent_audit_log(
      user_id, role_at_time, tool_name, input_summary, output_summary, status, error_message
    ) VALUES (
      v_uid, 'authenticated', 'create_borvat_direct_account',
      jsonb_build_object('merchant_store_id', _merchant_store_id),
      NULL, 'denied', 'forbidden'
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(_display_name), ''),
    v_store_display || ' (Borvat Direct)'
  );

  SELECT id INTO v_id
    FROM public.channel_accounts
    WHERE provider = 'borvat_direct'
      AND merchant_store_id = _merchant_store_id
    LIMIT 1;

  IF v_id IS NOT NULL THEN
    INSERT INTO public.agent_audit_log(
      user_id, role_at_time, tool_name, input_summary, output_summary, status
    ) VALUES (
      v_uid, 'authenticated', 'create_borvat_direct_account',
      jsonb_build_object('merchant_store_id', _merchant_store_id, 'idempotent', true),
      jsonb_build_object('channel_account_id', v_id),
      'success'
    );
    RETURN v_id;
  END IF;

  INSERT INTO public.channel_accounts (
    company_id, provider, external_account_id, display_name,
    control_state, status, merchant_store_id
  ) VALUES (
    v_store_company, 'borvat_direct', NULL, v_name,
    'paused'::public.p2_channel_control_state,
    'draft'::public.p2_lifecycle_status,
    _merchant_store_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.agent_audit_log(
    user_id, role_at_time, tool_name, input_summary, output_summary, status
  ) VALUES (
    v_uid, 'authenticated', 'create_borvat_direct_account',
    jsonb_build_object('merchant_store_id', _merchant_store_id),
    jsonb_build_object('channel_account_id', v_id),
    'success'
  );

  RETURN v_id;
END $$;

-- Re-assert grants (CREATE OR REPLACE preserves ACL, but be explicit)
REVOKE ALL ON FUNCTION public.create_borvat_direct_account(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_borvat_direct_account(uuid, text)
  TO authenticated, service_role, sandbox_exec;
