DO $outer$
DECLARE
  v_pass int := 0;
  v_fail int := 0;

  PROCEDURE_PLACEHOLDER boolean;
  c1 uuid; c2 uuid;
  s1 uuid; s2 uuid; s_other uuid;
  w1 uuid; w2 uuid;
  sku1 uuid; sku2 uuid;
  o1 uuid; o2 uuid; o_ret uuid; o_other uuid;
  p1 uuid; p2 uuid;
  u1 uuid;

  PROCEDURE_OK boolean;
BEGIN
  BEGIN  -- subtransaction: everything inside is rolled back at the end

    -- ============ FIXTURES ============
    u1 := gen_random_uuid();
    INSERT INTO public.companies (name, slug, owner_user_id)
      VALUES ('M1C1B Co A','m1c1b-co-a-'||substr(gen_random_uuid()::text,1,8), u1) RETURNING id INTO c1;
    INSERT INTO public.companies (name, slug, owner_user_id)
      VALUES ('M1C1B Co B','m1c1b-co-b-'||substr(gen_random_uuid()::text,1,8), u1) RETURNING id INTO c2;

    INSERT INTO public.merchant_stores (company_id, slug, display_name)
      VALUES (c1,'m1c1b-s1-'||substr(gen_random_uuid()::text,1,8),'S1') RETURNING id INTO s1;
    INSERT INTO public.merchant_stores (company_id, slug, display_name)
      VALUES (c1,'m1c1b-s2-'||substr(gen_random_uuid()::text,1,8),'S2') RETURNING id INTO s2;
    INSERT INTO public.merchant_stores (company_id, slug, display_name)
      VALUES (c2,'m1c1b-so-'||substr(gen_random_uuid()::text,1,8),'SOther') RETURNING id INTO s_other;

    INSERT INTO public.warehouses (company_id, code, name) VALUES (c1,'M1C1B-W1','W1') RETURNING id INTO w1;
    INSERT INTO public.warehouses (company_id, code, name) VALUES (c2,'M1C1B-W2','W2') RETURNING id INTO w2;

    INSERT INTO public.catalog_skus (company_id, code) VALUES (c1,'M1C1B-SKU1') RETURNING id INTO sku1;
    INSERT INTO public.catalog_skus (company_id, code) VALUES (c2,'M1C1B-SKU2') RETURNING id INTO sku2;

    -- ============ T1 origin happy path (warehouse-backed) ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, warehouse_id, origin_type, label, country_code, postal_code)
        VALUES (c1, s1, w1, 'warehouse', 'Main NL', 'NL', '1011AB') RETURNING id INTO o1;
      v_pass := v_pass+1; RAISE NOTICE 'PASS T1 origin created (warehouse-backed)';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T1: %', SQLERRM; END;

    -- ============ T2 cross-company warehouse rejected ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, warehouse_id, origin_type, label, country_code)
        VALUES (c1, s1, w2, 'warehouse', 'Bad WH', 'NL');
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T2 cross-company warehouse accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T2 cross-company warehouse rejected'; END;

    -- ============ T3 cross-company store rejected ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s_other, 'store', 'Bad store', 'NL');
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T3 cross-company store accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T3 cross-company store rejected'; END;

    -- ============ T4 invalid country code ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s1, 'store', 'Bad cc', 'nl');
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T4 lowercase country accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T4 invalid country rejected'; END;

    -- ============ T5 non-EU country representable (SE) ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s1, 'third_party_fulfillment', '3PL Sweden', 'SE');
      v_pass := v_pass+1; RAISE NOTICE 'PASS T5 SE origin representable';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T5: %', SQLERRM; END;

    -- ============ T6 invalid origin_type ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s1, 'dropship', 'Bad type', 'NL');
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T6 invalid origin_type accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T6 invalid origin_type rejected'; END;

    -- ============ T7 invalid status ============
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, origin_type, label, country_code, status)
        VALUES (c1, s1, 'store', 'Bad status', 'NL', 'enabled');
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T7 invalid status accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T7 invalid status rejected'; END;

    -- second + retired origin for later tests
    INSERT INTO public.merchant_fulfillment_origins
      (company_id, merchant_store_id, origin_type, label, country_code)
      VALUES (c1, s1, 'store', 'Shop counter', 'NL') RETURNING id INTO o2;
    INSERT INTO public.merchant_fulfillment_origins
      (company_id, merchant_store_id, origin_type, label, country_code, status)
      VALUES (c1, s1, 'store', 'Old site', 'NL', 'retired') RETURNING id INTO o_ret;
    INSERT INTO public.merchant_fulfillment_origins
      (company_id, merchant_store_id, origin_type, label, country_code)
      VALUES (c1, s2, 'store', 'Store2 origin', 'NL') RETURNING id INTO o_other;

    -- ============ T8 profile happy path ============
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles
        (company_id, merchant_store_id, catalog_sku_id, status)
        VALUES (c1, s1, sku1, 'active') RETURNING id INTO p1;
      v_pass := v_pass+1; RAISE NOTICE 'PASS T8 profile created';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T8: %', SQLERRM; END;

    -- ============ T9 cross-company SKU rejected ============
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles
        (company_id, merchant_store_id, catalog_sku_id) VALUES (c1, s1, sku2);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T9 cross-company SKU accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T9 cross-company SKU rejected'; END;

    -- ============ T10 duplicate ACTIVE profile per store+sku rejected ============
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles
        (company_id, merchant_store_id, catalog_sku_id, version, status)
        VALUES (c1, s1, sku1, 2, 'active');
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T10 duplicate active profile accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T10 duplicate active profile rejected'; END;

    -- ============ T11 draft version alongside active accepted ============
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles
        (company_id, merchant_store_id, catalog_sku_id, version, status,
         pickup_only, oversized, dangerous_goods, handling_class)
        VALUES (c1, s1, sku1, 2, 'draft', true, true, true, 'fragile') RETURNING id INTO p2;
      v_pass := v_pass+1; RAISE NOTICE 'PASS T11 pickup_only/oversized/dangerous draft version representable';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T11: %', SQLERRM; END;

    -- ============ T12..T16 package validation ============
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 1, 1, 1200, 400, 300, 200);
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 2, 1, 800, 300, 200, 100);
      v_pass := v_pass+1; RAISE NOTICE 'PASS T12 multi-parcel profile accepted';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T12: %', SQLERRM; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 2, 1, 500, 100, 100, 100);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T13 duplicate package_number accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T13 duplicate package_number rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p2, c1, s1, 1, 1, 500, 100, 100, 100);
      v_pass := v_pass+1; RAISE NOTICE 'PASS T14 same package_number in other profile accepted';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T14: %', SQLERRM; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 9, 1, 0, 100, 100, 100);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T15 zero weight accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T15 zero weight rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 10, 1, 500, -1, 100, 100);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T16 negative dimension accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T16 negative dimension rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 11, 0, 500, 100, 100, 100);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T17 zero quantity accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T17 zero quantity_per_package rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
         weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c2, s1, 12, 1, 500, 100, 100, 100);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T18 cross-company package accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T18 cross-company package rejected'; END;

    -- ============ T19..T25 origin assignment ============
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default)
        VALUES (p1, o1, c1, s1, 1, true);
      v_pass := v_pass+1; RAISE NOTICE 'PASS T19 origin assignment created';
    EXCEPTION WHEN others THEN v_fail := v_fail+1; RAISE NOTICE 'FAIL T19: %', SQLERRM; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default)
        VALUES (p1, o2, c1, s1, 2, true);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T20 second default accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T20 second default origin rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o2, c1, s1, 1);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T21 duplicate priority accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T21 duplicate priority rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o1, c1, s1, 3);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T22 duplicate profile-origin accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T22 duplicate profile-origin rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o_other, c1, s1, 4);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T23 cross-store origin assignment accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T23 cross-store origin assignment rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o1, c2, s1, 5);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T24 cross-company assignment accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T24 cross-company assignment rejected'; END;

    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o_ret, c1, s1, 6);
      v_fail := v_fail+1; RAISE NOTICE 'FAIL T25 retired origin assignment accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; RAISE NOTICE 'PASS T25 retired origin assignment rejected'; END;

    RAISE NOTICE 'M1C-1B FIXTURE RESULTS: PASS=% FAIL=%', v_pass, v_fail;

    -- force rollback of every fixture written above
    RAISE EXCEPTION 'M1C1B_ROLLBACK_FIXTURES';

  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'M1C1B_ROLLBACK_FIXTURES' THEN
      RAISE NOTICE 'M1C-1B HARNESS ABORTED: %', SQLERRM;
    ELSE
      RAISE NOTICE 'M1C-1B fixtures rolled back cleanly';
    END IF;
  END;

  -- zero-row evidence (post rollback)
  RAISE NOTICE 'ROWS origins=% profiles=% packages=% assignments=%',
    (SELECT count(*) FROM public.merchant_fulfillment_origins),
    (SELECT count(*) FROM public.merchant_store_sku_shipping_profiles),
    (SELECT count(*) FROM public.merchant_store_sku_shipping_packages),
    (SELECT count(*) FROM public.merchant_store_sku_fulfillment_origins);
END
$outer$;