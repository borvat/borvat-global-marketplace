-- M1A Migration #1 — Merchant Stores Foundation (additive-only)
-- Scope: create public.merchant_stores + trusted RPCs. No writes outside this table.
-- Blocked outside scope: channel_accounts, listings, products, catalog_*, orders, checkout, tax, shipping, inventory.

-- 1. TABLE
CREATE TABLE public.merchant_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  logo_url TEXT NULL,
  banner_url TEXT NULL,
  support_email TEXT NULL,
  support_phone TEXT NULL,
  default_locale TEXT NOT NULL DEFAULT 'nl-NL',
  default_currency TEXT NOT NULL DEFAULT 'EUR',
  country_code TEXT NOT NULL DEFAULT 'NL',
  sales_terms_url TEXT NULL,
  returns_policy_url TEXT NULL,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_facing_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  create_idempotency_key TEXT NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT merchant_stores_slug_format_ck
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$'),
  CONSTRAINT merchant_stores_slug_lowercase_ck
    CHECK (slug = lower(slug)),
  CONSTRAINT merchant_stores_status_ck
    CHECK (status IN ('draft','active','suspended','closed')),
  CONSTRAINT merchant_stores_currency_ck
    CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT merchant_stores_country_ck
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT merchant_stores_locale_ck
    CHECK (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT merchant_stores_display_name_ck
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT merchant_stores_support_email_ck
    CHECK (support_email IS NULL OR support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT merchant_stores_branding_object_ck
    CHECK (jsonb_typeof(branding) = 'object'),
  CONSTRAINT merchant_stores_settings_object_ck
    CHECK (jsonb_typeof(customer_facing_settings) = 'object')
);

CREATE UNIQUE INDEX merchant_stores_slug_uk ON public.merchant_stores (slug);
CREATE UNIQUE INDEX merchant_stores_one_primary_per_company_uk
  ON public.merchant_stores (company_id) WHERE is_primary = true;
CREATE UNIQUE INDEX merchant_stores_idempotency_uk
  ON public.merchant_stores (company_id, create_idempotency_key)
  WHERE create_idempotency_key IS NOT NULL;
CREATE INDEX merchant_stores_company_id_ix ON public.merchant_stores (company_id);
CREATE INDEX merchant_stores_status_ix ON public.merchant_stores (status);

COMMENT ON TABLE public.merchant_stores IS
  'M1A: Merchant-facing store foundation. Additive. Writes only via SECURITY DEFINER RPCs. No public/anon exposure in M1A.';

-- 2. GRANTS
GRANT SELECT ON public.merchant_stores TO authenticated;
GRANT ALL   ON public.merchant_stores TO service_role;
-- NO grants to anon. NO write grants to authenticated.

-- 3. RLS
ALTER TABLE public.merchant_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_stores FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_stores_select_company_member
  ON public.merchant_stores
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
-- No INSERT/UPDATE/DELETE policies. All writes go through SECURITY DEFINER RPCs.

-- 4. updated_at trigger
CREATE TRIGGER trg_merchant_stores_updated_at
  BEFORE UPDATE ON public.merchant_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Manager check
CREATE OR REPLACE FUNCTION public._merchant_store_can_manage(_company_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE WHEN auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid()
         THEN false
         ELSE (
           public.is_company_owner(_company_id, _user_id)
           OR EXISTS (
             SELECT 1
             FROM public.company_members cm
             JOIN public.company_member_roles cmr ON cmr.member_id = cm.id
             JOIN public.system_company_roles r    ON r.id = cmr.role_id
             WHERE cm.company_id = _company_id
               AND cm.user_id    = _user_id
               AND cm.status     = 'active'
               AND r.key IN ('owner','admin')
           )
         )
    END
$$;

REVOKE ALL ON FUNCTION public._merchant_store_can_manage(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._merchant_store_can_manage(UUID, UUID) TO authenticated, service_role;

-- 6. create_merchant_store
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
    jsonb_build_object('store_id', v_id), 'ok');

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_merchant_store(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_merchant_store(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
  TO authenticated, service_role;

-- 7. update_merchant_store_profile
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
    jsonb_build_object('ok', true), 'ok');
END $$;

REVOKE ALL ON FUNCTION public.update_merchant_store_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_merchant_store_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB)
  TO authenticated, service_role;