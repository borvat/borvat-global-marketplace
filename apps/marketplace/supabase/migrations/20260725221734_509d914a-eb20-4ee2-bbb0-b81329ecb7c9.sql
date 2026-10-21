-- ============================================================================
-- M1A #2D-2A — PLATFORM ADMIN CROSS-MERCHANT READ RPC FOUNDATION
-- Read-only, admin-gated, keyset-paginated, allowlisted response columns.
-- No RLS changes, no table changes, no writes.
-- ============================================================================

-- ------------------------------------------------------------------
-- A. admin_list_merchant_stores
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_merchant_stores(
  _page_size         integer     DEFAULT 50,
  _after_created_at  timestamptz DEFAULT NULL,
  _after_id          uuid        DEFAULT NULL,
  _search            text        DEFAULT NULL,
  _status            text        DEFAULT NULL
)
RETURNS TABLE (
  company_id       uuid,
  company_name     text,
  store_id         uuid,
  display_name     text,
  slug             text,
  store_status     text,
  is_primary       boolean,
  country_code     text,
  default_locale   text,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_size  integer;
  v_q     text;
  v_st    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(_page_size, 50), 100));

  v_q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF v_q IS NOT NULL AND length(v_q) > 100 THEN
    RAISE EXCEPTION 'search_too_long' USING ERRCODE = '22023';
  END IF;

  v_st := NULLIF(btrim(COALESCE(_status, '')), '');
  IF v_st IS NOT NULL AND v_st NOT IN ('draft','active','inactive','archived') THEN
    RAISE EXCEPTION 'invalid_status_filter' USING ERRCODE = '22023';
  END IF;

  IF (_after_created_at IS NULL) <> (_after_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id            AS company_id,
    c.name          AS company_name,
    s.id            AS store_id,
    s.display_name  AS display_name,
    s.slug          AS slug,
    s.status::text  AS store_status,
    s.is_primary    AS is_primary,
    s.country_code  AS country_code,
    s.default_locale AS default_locale,
    s.created_at    AS created_at,
    s.updated_at    AS updated_at
  FROM public.merchant_stores s
  JOIN public.companies c ON c.id = s.company_id
  WHERE (v_st IS NULL OR s.status = v_st)
    AND (
      v_q IS NULL
      OR c.name         ILIKE '%' || v_q || '%'
      OR s.display_name ILIKE '%' || v_q || '%'
      OR s.slug         ILIKE '%' || v_q || '%'
    )
    AND (
      _after_created_at IS NULL
      OR (s.created_at, s.id) < (_after_created_at, _after_id)
    )
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT v_size + 1;
END;
$$;

ALTER FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text) TO sandbox_exec;

-- ------------------------------------------------------------------
-- B. admin_list_borvat_direct_accounts
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_borvat_direct_accounts(
  _page_size         integer     DEFAULT 50,
  _after_created_at  timestamptz DEFAULT NULL,
  _after_id          uuid        DEFAULT NULL,
  _search            text        DEFAULT NULL,
  _status            text        DEFAULT NULL
)
RETURNS TABLE (
  company_id          uuid,
  company_name        text,
  merchant_store_id   uuid,
  store_name          text,
  channel_account_id  uuid,
  provider            text,
  display_name        text,
  status              text,
  control_state       text,
  created_at          timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_size integer;
  v_q    text;
  v_st   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(_page_size, 50), 100));

  v_q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF v_q IS NOT NULL AND length(v_q) > 100 THEN
    RAISE EXCEPTION 'search_too_long' USING ERRCODE = '22023';
  END IF;

  v_st := NULLIF(btrim(COALESCE(_status, '')), '');
  IF v_st IS NOT NULL AND v_st NOT IN ('draft','active','inactive','archived') THEN
    RAISE EXCEPTION 'invalid_status_filter' USING ERRCODE = '22023';
  END IF;

  IF (_after_created_at IS NULL) <> (_after_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id                  AS company_id,
    c.name                AS company_name,
    s.id                  AS merchant_store_id,
    s.display_name        AS store_name,
    a.id                  AS channel_account_id,
    a.provider            AS provider,
    a.display_name        AS display_name,
    a.status::text        AS status,
    a.control_state::text AS control_state,
    a.created_at          AS created_at,
    a.updated_at          AS updated_at
  FROM public.channel_accounts a
  JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.merchant_stores s ON s.id = a.merchant_store_id
  WHERE a.provider = 'borvat_direct'
    AND (v_st IS NULL OR a.status::text = v_st)
    AND (
      v_q IS NULL
      OR c.name         ILIKE '%' || v_q || '%'
      OR s.display_name ILIKE '%' || v_q || '%'
      OR s.slug         ILIKE '%' || v_q || '%'
    )
    AND (
      _after_created_at IS NULL
      OR (a.created_at, a.id) < (_after_created_at, _after_id)
    )
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT v_size + 1;
END;
$$;

ALTER FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text) TO sandbox_exec;

-- ------------------------------------------------------------------
-- C. admin_list_borvat_direct_draft_listings
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_borvat_direct_draft_listings(
  _page_size         integer     DEFAULT 50,
  _after_created_at  timestamptz DEFAULT NULL,
  _after_id          uuid        DEFAULT NULL,
  _search            text        DEFAULT NULL,
  _status            text        DEFAULT NULL
)
RETURNS TABLE (
  company_id           uuid,
  company_name         text,
  merchant_store_id    uuid,
  store_name           text,
  channel_account_id   uuid,
  listing_id           uuid,
  sku_id               uuid,
  sku_code             text,
  product_id           uuid,
  product_title        text,
  brand                text,
  listing_status       text,
  control_state        text,
  published_quantity   integer,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_size integer;
  v_q    text;
  v_st   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(_page_size, 50), 100));

  v_q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF v_q IS NOT NULL AND length(v_q) > 100 THEN
    RAISE EXCEPTION 'search_too_long' USING ERRCODE = '22023';
  END IF;

  v_st := NULLIF(btrim(COALESCE(_status, '')), '');
  IF v_st IS NOT NULL AND v_st NOT IN ('draft','active','inactive','archived') THEN
    RAISE EXCEPTION 'invalid_status_filter' USING ERRCODE = '22023';
  END IF;

  IF (_after_created_at IS NULL) <> (_after_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id                  AS company_id,
    c.name                AS company_name,
    s.id                  AS merchant_store_id,
    s.display_name        AS store_name,
    a.id                  AS channel_account_id,
    l.id                  AS listing_id,
    sk.id                 AS sku_id,
    sk.code               AS sku_code,
    p.id                  AS product_id,
    p.title               AS product_title,
    p.brand               AS brand,
    l.status::text        AS listing_status,
    l.control_state::text AS control_state,
    l.published_quantity  AS published_quantity,
    l.created_at          AS created_at,
    l.updated_at          AS updated_at
  FROM public.channel_listings l
  JOIN public.channel_accounts a ON a.id = l.channel_account_id AND a.provider = 'borvat_direct'
  JOIN public.companies c ON c.id = l.company_id
  LEFT JOIN public.merchant_stores s ON s.id = a.merchant_store_id
  LEFT JOIN public.catalog_skus sk  ON sk.id = l.sku_id
  LEFT JOIN public.catalog_products p ON p.id = sk.product_id
  WHERE (v_st IS NULL OR l.status::text = v_st)
    AND (
      v_q IS NULL
      OR c.name         ILIKE '%' || v_q || '%'
      OR s.display_name ILIKE '%' || v_q || '%'
      OR s.slug         ILIKE '%' || v_q || '%'
      OR sk.code        ILIKE '%' || v_q || '%'
      OR p.title        ILIKE '%' || v_q || '%'
    )
    AND (
      _after_created_at IS NULL
      OR (l.created_at, l.id) < (_after_created_at, _after_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT v_size + 1;
END;
$$;

ALTER FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text) TO sandbox_exec;

COMMENT ON FUNCTION public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text) IS
  'M1A #2D-2A read-only. Platform-admin-gated. Keyset pagination: fetch page_size+1; extra row indicates has_more.';
COMMENT ON FUNCTION public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text) IS
  'M1A #2D-2A read-only. Platform-admin-gated. Restricted to provider=borvat_direct.';
COMMENT ON FUNCTION public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text) IS
  'M1A #2D-2A read-only. Platform-admin-gated. Restricted to borvat_direct provider listings.';