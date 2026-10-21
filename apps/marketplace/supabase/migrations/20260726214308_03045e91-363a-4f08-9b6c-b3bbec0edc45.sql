-- M1V-1A — SELLER MANAGER LIVE READ-ONLY INTEGRATION
-- Read-only seller RPCs. No DML, no writes, no new tables, no table grants.

CREATE OR REPLACE FUNCTION public.seller_list_workspaces()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  store_id uuid,
  store_slug text,
  store_name text,
  store_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.name, s.id, s.slug, s.display_name, s.status
  FROM public.company_members m
  JOIN public.companies c ON c.id = m.company_id
  LEFT JOIN public.merchant_stores s ON s.company_id = c.id
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
  ORDER BY c.name, s.display_name NULLS FIRST
$$;

CREATE OR REPLACE FUNCTION public.seller_store_overview(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  active_listings integer,
  draft_listings integer,
  products_no_stock integer,
  low_stock_items integer,
  total_available integer,
  total_reserved integer,
  fulfillment_origins integer,
  action_required integer,
  live_channels integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.company_members m
       WHERE m.company_id = p_company_id
         AND m.user_id = auth.uid()
         AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  IF p_store_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.merchant_stores s
       WHERE s.id = p_store_id AND s.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH sku AS (
    SELECT k.id, k.status::text AS sku_status, p.status::text AS product_status
    FROM public.catalog_skus k
    JOIN public.catalog_products p ON p.id = k.product_id
    WHERE k.company_id = p_company_id
  ),
  stock AS (
    SELECT b.sku_id,
           COALESCE(SUM(b.quantity) FILTER (WHERE b.disposition = 'sellable'), 0)::int AS available
    FROM public.inventory_balances b
    WHERE b.company_id = p_company_id
    GROUP BY b.sku_id
  ),
  reserved AS (
    SELECT COALESCE(SUM(l.required_base_quantity - l.consumed_quantity - l.released_quantity), 0)::int AS qty
    FROM public.inventory_reservation_lines l
    JOIN public.inventory_reservation_headers h ON h.id = l.reservation_id
    WHERE h.company_id = p_company_id AND h.status = 'active'
  ),
  priced AS (
    SELECT DISTINCT pr.catalog_sku_id
    FROM public.merchant_store_offer_prices pr
    WHERE p_store_id IS NOT NULL
      AND pr.merchant_store_id = p_store_id
      AND pr.status = 'active'
  )
  SELECT
    (SELECT COUNT(*) FROM sku WHERE product_status = 'active')::int,
    (SELECT COUNT(*) FROM sku WHERE product_status = 'draft')::int,
    (SELECT COUNT(*) FROM sku s LEFT JOIN stock st ON st.sku_id = s.id
      WHERE COALESCE(st.available, 0) = 0)::int,
    (SELECT COUNT(*) FROM sku s JOIN stock st ON st.sku_id = s.id
      WHERE st.available > 0 AND st.available <= 5)::int,
    (SELECT COALESCE(SUM(available), 0)::int FROM stock),
    (SELECT qty FROM reserved),
    (SELECT COUNT(*)::int FROM public.merchant_fulfillment_origins o
      WHERE o.company_id = p_company_id
        AND (p_store_id IS NULL OR o.merchant_store_id = p_store_id)),
    (SELECT COUNT(*) FROM sku s LEFT JOIN priced pp ON pp.catalog_sku_id = s.id
      WHERE p_store_id IS NOT NULL AND pp.catalog_sku_id IS NULL)::int,
    0;
END;
$$;

CREATE OR REPLACE FUNCTION public.seller_list_catalog(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  sku_id uuid,
  product_id uuid,
  title text,
  brand text,
  sku_code text,
  product_status text,
  sku_status text,
  price_minor bigint,
  currency_code text,
  available integer,
  reserved integer,
  delivery_promise text,
  fulfillment_origin text,
  publication_status text,
  tax_classification text,
  action_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.company_members m
       WHERE m.company_id = p_company_id AND m.user_id = auth.uid() AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  IF p_store_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.merchant_stores s
       WHERE s.id = p_store_id AND s.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    k.id,
    p.id,
    p.title,
    p.brand,
    k.code,
    p.status::text,
    k.status::text,
    pr.gross_amount_minor,
    pr.currency_code,
    COALESCE(st.available, 0)::int,
    public.sku_active_reserved(p_company_id, k.id),
    dp.fulfillment_mode,
    fo.label,
    pub.publication_status,
    tc.status::text,
    NULLIF(
      CONCAT_WS(
        ', ',
        CASE WHEN pr.gross_amount_minor IS NULL THEN 'missing price' END,
        CASE WHEN tc.status IS NULL THEN 'missing tax classification' END,
        CASE WHEN COALESCE(st.available, 0) = 0 THEN 'no stock' END
      ), ''
    )
  FROM public.catalog_skus k
  JOIN public.catalog_products p ON p.id = k.product_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(b.quantity) FILTER (WHERE b.disposition = 'sellable'), 0)::int AS available
    FROM public.inventory_balances b
    WHERE b.company_id = p_company_id AND b.sku_id = k.id
  ) st ON TRUE
  LEFT JOIN LATERAL (
    SELECT x.gross_amount_minor, x.currency_code
    FROM public.merchant_store_offer_prices x
    WHERE p_store_id IS NOT NULL
      AND x.merchant_store_id = p_store_id
      AND x.catalog_sku_id = k.id
      AND x.status = 'active'
    ORDER BY x.version DESC
    LIMIT 1
  ) pr ON TRUE
  LEFT JOIN LATERAL (
    SELECT a.fulfillment_mode
    FROM public.merchant_store_sku_delivery_promise_assignments a
    JOIN public.merchant_store_sku_shipping_profiles sp ON sp.id = a.shipping_profile_id
    WHERE a.company_id = p_company_id
      AND sp.catalog_sku_id = k.id
      AND a.status = 'active'
      AND (p_store_id IS NULL OR a.merchant_store_id = p_store_id)
    ORDER BY a.version_number DESC
    LIMIT 1
  ) dp ON TRUE
  LEFT JOIN LATERAL (
    SELECT o.label
    FROM public.merchant_store_sku_fulfillment_origins so
    JOIN public.merchant_store_sku_shipping_profiles sp2 ON sp2.id = so.shipping_profile_id
    JOIN public.merchant_fulfillment_origins o ON o.id = so.fulfillment_origin_id
    WHERE sp2.catalog_sku_id = k.id
      AND so.company_id = p_company_id
      AND so.status = 'active'
      AND (p_store_id IS NULL OR so.merchant_store_id = p_store_id)
    ORDER BY so.is_default DESC, so.priority ASC
    LIMIT 1
  ) fo ON TRUE
  LEFT JOIN LATERAL (
    SELECT b.publication_status
    FROM public.channel_listings cl
    JOIN public.borvat_direct_listing_publications b ON b.channel_listing_id = cl.id
    WHERE cl.company_id = p_company_id AND cl.sku_id = k.id
    ORDER BY b.status_changed_at DESC
    LIMIT 1
  ) pub ON TRUE
  LEFT JOIN LATERAL (
    SELECT c.status
    FROM public.catalog_product_tax_classifications c
    WHERE c.product_id = p.id AND c.status = 'approved'
    LIMIT 1
  ) tc ON TRUE
  WHERE k.company_id = p_company_id
  ORDER BY p.title, k.code
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.seller_list_inventory(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  sku_id uuid,
  sku_code text,
  title text,
  warehouse_code text,
  warehouse_name text,
  location_code text,
  on_hand integer,
  reserved integer,
  available integer,
  published_quantity integer,
  last_movement_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.company_members m
       WHERE m.company_id = p_company_id AND m.user_id = auth.uid() AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  IF p_store_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.merchant_stores s
       WHERE s.id = p_store_id AND s.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    k.id,
    k.code,
    p.title,
    w.code,
    w.name,
    wl.code,
    COALESCE(SUM(b.quantity), 0)::int,
    public.sku_active_reserved(p_company_id, k.id),
    COALESCE(SUM(b.quantity) FILTER (WHERE b.disposition = 'sellable'), 0)::int,
    (SELECT MAX(cl.published_quantity) FROM public.channel_listings cl
      WHERE cl.company_id = p_company_id AND cl.sku_id = k.id),
    MAX(b.updated_at)
  FROM public.inventory_balances b
  JOIN public.catalog_skus k ON k.id = b.sku_id
  JOIN public.catalog_products p ON p.id = k.product_id
  LEFT JOIN public.warehouses w ON w.id = b.warehouse_id
  LEFT JOIN public.warehouse_locations wl ON wl.id = b.location_id
  WHERE b.company_id = p_company_id
  GROUP BY k.id, k.code, p.title, w.code, w.name, wl.code
  ORDER BY p.title, k.code
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 100), 300), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.seller_get_store_profile(
  p_company_id uuid,
  p_store_id uuid
)
RETURNS TABLE (
  store_id uuid,
  company_id uuid,
  company_name text,
  slug text,
  display_name text,
  description text,
  status text,
  is_primary boolean,
  default_locale text,
  default_currency text,
  country_code text,
  logo_url text,
  banner_url text,
  sales_terms_url text,
  returns_policy_url text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.company_members m
       WHERE m.company_id = p_company_id AND m.user_id = auth.uid() AND m.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.merchant_stores s
       WHERE s.id = p_store_id AND s.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'seller_scope_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.company_id, c.name, s.slug, s.display_name, s.description, s.status,
         s.is_primary, s.default_locale, s.default_currency, s.country_code,
         s.logo_url, s.banner_url, s.sales_terms_url, s.returns_policy_url,
         s.created_at, s.updated_at
  FROM public.merchant_stores s
  JOIN public.companies c ON c.id = s.company_id
  WHERE s.id = p_store_id AND s.company_id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_list_workspaces() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seller_store_overview(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seller_list_catalog(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seller_list_inventory(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seller_get_store_profile(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.seller_list_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_store_overview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_list_catalog(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_list_inventory(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_get_store_profile(uuid, uuid) TO authenticated;