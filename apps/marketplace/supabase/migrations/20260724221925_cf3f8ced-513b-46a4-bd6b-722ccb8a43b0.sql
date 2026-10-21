-- Fix: agent_audit_log.status must be one of 'success','denied','error'.
CREATE OR REPLACE FUNCTION public.create_merchant_store(
  _company_id UUID,
  _slug TEXT,
  _display_name TEXT,
  _description TEXT DEFAULT NULL,
  _default_locale TEXT DEFAULT 'nl-NL',
  _default_currency TEXT DEFAULT 'EUR',
  _country_code TEXT DEFAULT 'NL',
  _is_primary BOOLEAN DEFAULT false,
  _idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id   UUID;
  v_slug TEXT := lower(btrim(_slug));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required' USING ERRCODE = '22004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'company not found' USING ERRCODE = '23503';
  END IF;
  IF NOT public._merchant_store_can_manage(_company_id, v_user) THEN
    RAISE EXCEPTION 'access denied: stores.manage required' USING ERRCODE = '42501';
  END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid slug: lowercase letters, digits, hyphen; length 2-64; no leading/trailing hyphen' USING ERRCODE = '22023';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.merchant_stores
     WHERE company_id = _company_id AND create_idempotency_key = _idempotency_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.merchant_stores (
    company_id, slug, display_name, description,
    default_locale, default_currency, country_code,
    is_primary, create_idempotency_key, created_by, updated_by
  ) VALUES (
    _company_id, v_slug, btrim(_display_name), NULLIF(btrim(_description), ''),
    _default_locale, _default_currency, _country_code,
    COALESCE(_is_primary, false), _idempotency_key, v_user, v_user
  ) RETURNING id INTO v_id;

  INSERT INTO public.agent_audit_log (user_id, role_at_time, tool_name, client_id, input_summary, output_summary, status)
  VALUES (v_user, 'authenticated', 'create_merchant_store', 'rpc',
    jsonb_build_object('company_id', _company_id, 'slug', v_slug, 'is_primary', COALESCE(_is_primary,false)),
    jsonb_build_object('store_id', v_id), 'success');

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_merchant_store_profile(
  _store_id UUID,
  _display_name TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _logo_url TEXT DEFAULT NULL,
  _banner_url TEXT DEFAULT NULL,
  _support_email TEXT DEFAULT NULL,
  _support_phone TEXT DEFAULT NULL,
  _sales_terms_url TEXT DEFAULT NULL,
  _returns_policy_url TEXT DEFAULT NULL,
  _branding JSONB DEFAULT NULL,
  _customer_facing_settings JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_company UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT company_id INTO v_company FROM public.merchant_stores WHERE id = _store_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'store not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public._merchant_store_can_manage(v_company, v_user) THEN
    RAISE EXCEPTION 'access denied: stores.manage required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.merchant_stores
     SET display_name             = COALESCE(NULLIF(btrim(_display_name), ''), display_name),
         description              = COALESCE(_description, description),
         logo_url                 = COALESCE(_logo_url, logo_url),
         banner_url               = COALESCE(_banner_url, banner_url),
         support_email            = COALESCE(_support_email, support_email),
         support_phone            = COALESCE(_support_phone, support_phone),
         sales_terms_url          = COALESCE(_sales_terms_url, sales_terms_url),
         returns_policy_url       = COALESCE(_returns_policy_url, returns_policy_url),
         branding                 = COALESCE(_branding, branding),
         customer_facing_settings = COALESCE(_customer_facing_settings, customer_facing_settings),
         updated_by               = v_user
   WHERE id = _store_id;

  INSERT INTO public.agent_audit_log (user_id, role_at_time, tool_name, client_id, input_summary, output_summary, status)
  VALUES (v_user, 'authenticated', 'update_merchant_store_profile', 'rpc',
    jsonb_build_object('store_id', _store_id, 'company_id', v_company,
      'fields', (SELECT jsonb_agg(k) FROM (VALUES
        ('display_name', _display_name IS NOT NULL),
        ('description',  _description IS NOT NULL),
        ('logo_url',     _logo_url IS NOT NULL),
        ('banner_url',   _banner_url IS NOT NULL),
        ('support_email',_support_email IS NOT NULL),
        ('support_phone',_support_phone IS NOT NULL),
        ('sales_terms_url',_sales_terms_url IS NOT NULL),
        ('returns_policy_url',_returns_policy_url IS NOT NULL),
        ('branding',     _branding IS NOT NULL),
        ('customer_facing_settings', _customer_facing_settings IS NOT NULL)
      ) t(k, changed) WHERE changed)),
    jsonb_build_object('ok', true), 'success');
END $$;

REVOKE ALL ON FUNCTION public.create_merchant_store(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_merchant_store_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_merchant_store(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_merchant_store_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;