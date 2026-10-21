
CREATE OR REPLACE FUNCTION public.create_borvat_direct_draft_listing(
  _merchant_store_id uuid,
  _catalog_sku_id uuid,
  _idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_company uuid;
  v_store_status public.p2_lifecycle_status;
  v_account_id uuid;
  v_account_company uuid;
  v_sku_company uuid;
  v_sku_status public.p2_lifecycle_status;
  v_ext_id text;
  v_listing_id uuid;
  v_existing_sku uuid;
  v_existing_offer uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Merchant store existence + owning company
  SELECT company_id, status
    INTO v_store_company, v_store_status
    FROM public.merchant_stores
   WHERE id = _merchant_store_id;

  IF v_store_company IS NULL THEN
    RAISE EXCEPTION 'merchant_store not found' USING ERRCODE = '23503';
  END IF;

  IF v_store_status <> 'active' THEN
    RAISE EXCEPTION 'merchant_store not active' USING ERRCODE = '22023';
  END IF;

  -- Authorization: caller must have listings.manage on the store's company
  IF NOT public.company_member_has_permission(v_store_company, v_uid, 'listings.manage') THEN
    INSERT INTO public.agent_audit_log(
      user_id, role_at_time, tool_name, input_summary, output_summary, status, error_message
    ) VALUES (
      v_uid, 'authenticated', 'create_borvat_direct_draft_listing',
      jsonb_build_object(
        'merchant_store_id', _merchant_store_id,
        'catalog_sku_id', _catalog_sku_id
      ),
      NULL, 'denied', 'forbidden'
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Borvat Direct account for this store must exist in the paused/draft/no-external state
  SELECT id, company_id
    INTO v_account_id, v_account_company
    FROM public.channel_accounts
   WHERE merchant_store_id = _merchant_store_id
     AND provider = 'borvat_direct'
     AND control_state = 'paused'::public.p2_channel_control_state
     AND status = 'draft'::public.p2_lifecycle_status
     AND external_account_id IS NULL
   LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'borvat_direct account not found for merchant_store' USING ERRCODE = '23503';
  END IF;

  IF v_account_company <> v_store_company THEN
    RAISE EXCEPTION 'account/company mismatch' USING ERRCODE = '42501';
  END IF;

  -- SKU validation: must exist, belong to the same company, be active
  SELECT company_id, status
    INTO v_sku_company, v_sku_status
    FROM public.catalog_skus
   WHERE id = _catalog_sku_id;

  IF v_sku_company IS NULL THEN
    RAISE EXCEPTION 'sku not found' USING ERRCODE = '23503';
  END IF;

  IF v_sku_company <> v_store_company THEN
    RAISE EXCEPTION 'sku not in merchant_store company' USING ERRCODE = '42501';
  END IF;

  IF v_sku_status <> 'active'::public.p2_lifecycle_status THEN
    RAISE EXCEPTION 'sku not active' USING ERRCODE = '22023';
  END IF;

  -- Server-derived deterministic channel-native listing identifier
  v_ext_id := 'borvat_direct:sku:' || _catalog_sku_id::text;

  -- Atomic idempotent insert against existing UNIQUE (channel_account_id, external_listing_id)
  INSERT INTO public.channel_listings(
    company_id, channel_account_id, sku_id, offer_id, external_listing_id,
    units_per_offer, published_quantity, published_version, status, control_state
  ) VALUES (
    v_store_company, v_account_id, _catalog_sku_id, NULL, v_ext_id,
    1, 0, 0,
    'draft'::public.p2_lifecycle_status,
    'read_only_import'::public.p2_channel_control_state
  )
  ON CONFLICT (channel_account_id, external_listing_id) DO NOTHING
  RETURNING id INTO v_listing_id;

  IF v_listing_id IS NULL THEN
    -- Existing row: verify it maps to the same SKU and is still offer-less
    SELECT id, sku_id, offer_id
      INTO v_listing_id, v_existing_sku, v_existing_offer
      FROM public.channel_listings
     WHERE channel_account_id = v_account_id
       AND external_listing_id = v_ext_id;

    IF v_listing_id IS NULL
       OR v_existing_sku IS DISTINCT FROM _catalog_sku_id
       OR v_existing_offer IS NOT NULL
    THEN
      INSERT INTO public.agent_audit_log(
        user_id, role_at_time, tool_name, input_summary, output_summary, status, error_message
      ) VALUES (
        v_uid, 'authenticated', 'create_borvat_direct_draft_listing',
        jsonb_build_object(
          'merchant_store_id', _merchant_store_id,
          'catalog_sku_id', _catalog_sku_id,
          'external_listing_id', v_ext_id
        ),
        NULL, 'denied', 'integrity_conflict'
      );
      RAISE EXCEPTION 'integrity conflict on borvat_direct listing identifier' USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.agent_audit_log(
    user_id, role_at_time, tool_name, input_summary, output_summary, status
  ) VALUES (
    v_uid, 'authenticated', 'create_borvat_direct_draft_listing',
    jsonb_build_object(
      'merchant_store_id', _merchant_store_id,
      'catalog_sku_id', _catalog_sku_id,
      'idempotency_key', _idempotency_key
    ),
    jsonb_build_object(
      'listing_id', v_listing_id,
      'channel_account_id', v_account_id,
      'external_listing_id', v_ext_id
    ),
    'success'
  );

  RETURN v_listing_id;
END $$;

REVOKE ALL ON FUNCTION public.create_borvat_direct_draft_listing(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_borvat_direct_draft_listing(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_borvat_direct_draft_listing(uuid, uuid, text) TO authenticated;
