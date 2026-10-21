-- =========================================================================
-- M1A Migration #2A — Borvat Direct Account Foundation
-- Additive-only. No listings. No cutover. Fail-closed.
-- =========================================================================

-- 1. Link column to merchant_stores (nullable; existing 134 external rows keep NULL)
ALTER TABLE public.channel_accounts
  ADD COLUMN IF NOT EXISTS merchant_store_id UUID NULL
    REFERENCES public.merchant_stores(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS channel_accounts_merchant_store_id_ix
  ON public.channel_accounts(merchant_store_id)
  WHERE merchant_store_id IS NOT NULL;

-- 2. One Borvat Direct account per merchant_store
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_borvat_direct_per_store_uk
  ON public.channel_accounts(merchant_store_id)
  WHERE provider = 'borvat_direct';

-- 3. Fail-closed shape for borvat_direct rows
ALTER TABLE public.channel_accounts
  ADD CONSTRAINT channel_accounts_borvat_direct_shape_ck CHECK (
    provider <> 'borvat_direct' OR (
      merchant_store_id IS NOT NULL
      AND external_account_id IS NULL
      AND control_state = 'paused'::p2_channel_control_state
      AND status IN ('draft'::p2_lifecycle_status, 'inactive'::p2_lifecycle_status)
    )
  );

-- 4. External-provider rows carry no merchant_store binding in this migration
ALTER TABLE public.channel_accounts
  ADD CONSTRAINT channel_accounts_external_no_store_ck CHECK (
    provider = 'borvat_direct' OR merchant_store_id IS NULL
  );

-- 5. Company consistency trigger
CREATE OR REPLACE FUNCTION public._channel_accounts_company_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_store_company UUID;
BEGIN
  IF NEW.merchant_store_id IS NOT NULL THEN
    SELECT company_id INTO v_store_company
    FROM public.merchant_stores
    WHERE id = NEW.merchant_store_id;

    IF v_store_company IS NULL THEN
      RAISE EXCEPTION 'merchant_store not found' USING ERRCODE = '23503';
    END IF;

    IF v_store_company <> NEW.company_id THEN
      RAISE EXCEPTION 'company_id does not match merchant_store.company_id'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS channel_accounts_company_consistency ON public.channel_accounts;
CREATE TRIGGER channel_accounts_company_consistency
  BEFORE INSERT OR UPDATE OF merchant_store_id, company_id
  ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public._channel_accounts_company_consistency();

-- 6. Trusted RPC — the only sanctioned creation path
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

  -- Idempotency: only one borvat_direct account per merchant_store (unique index)
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
    'paused'::p2_channel_control_state,
    'draft'::p2_lifecycle_status,
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

-- 7. Grant hardening — no default ACLs, only sanctioned callers
REVOKE ALL ON FUNCTION public.create_borvat_direct_account(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public._channel_accounts_company_consistency()
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

GRANT EXECUTE ON FUNCTION public.create_borvat_direct_account(uuid, text)
  TO authenticated, service_role;
-- Trigger function stays owner-only; triggers run under table owner privileges.
