DO $outer$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_notes text := '';
  c1 uuid; c2 uuid; s1 uuid; s2 uuid; s_other uuid;
  w1 uuid; w2 uuid; sku1 uuid; sku2 uuid;
  o1 uuid; o2 uuid; o_ret uuid; o_other uuid;
  p1 uuid; p2 uuid; u1 uuid;
BEGIN
  BEGIN
    SELECT id INTO u1 FROM auth.users ORDER BY created_at LIMIT 1;
    IF u1 IS NULL THEN
      RAISE EXCEPTION 'M1C-1B: no user available for fixtures';
    END IF;
    INSERT INTO public.companies (name, slug, owner_user_id)
      VALUES ('M1C1B A','m1c1b-a-'||substr(gen_random_uuid()::text,1,8), u1) RETURNING id INTO c1;
    INSERT INTO public.companies (name, slug, owner_user_id)
      VALUES ('M1C1B B','m1c1b-b-'||substr(gen_random_uuid()::text,1,8), u1) RETURNING id INTO c2;
    INSERT INTO public.merchant_stores (company_id, slug, display_name)
      VALUES (c1,'m1c1b-s1-'||substr(gen_random_uuid()::text,1,8),'S1') RETURNING id INTO s1;
    INSERT INTO public.merchant_stores (company_id, slug, display_name)
      VALUES (c1,'m1c1b-s2-'||substr(gen_random_uuid()::text,1,8),'S2') RETURNING id INTO s2;
    INSERT INTO public.merchant_stores (company_id, slug, display_name)
      VALUES (c2,'m1c1b-so-'||substr(gen_random_uuid()::text,1,8),'SO') RETURNING id INTO s_other;
    INSERT INTO public.warehouses (company_id, code, name) VALUES (c1,'M1C1B-W1','W1') RETURNING id INTO w1;
    INSERT INTO public.warehouses (company_id, code, name) VALUES (c2,'M1C1B-W2','W2') RETURNING id INTO w2;
    INSERT INTO public.catalog_skus (company_id, code) VALUES (c1,'M1C1B-SKU1') RETURNING id INTO sku1;
    INSERT INTO public.catalog_skus (company_id, code) VALUES (c2,'M1C1B-SKU2') RETURNING id INTO sku2;

    -- T1 must succeed
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins
        (company_id, merchant_store_id, warehouse_id, origin_type, label, country_code, postal_code)
        VALUES (c1, s1, w1, 'warehouse', 'Main NL', 'NL', '1011AB') RETURNING id INTO o1;
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T1:'||SQLERRM; END;

    -- T2 cross-company warehouse must fail
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, warehouse_id, origin_type, label, country_code)
        VALUES (c1, s1, w2, 'warehouse', 'Bad WH', 'NL');
      v_fail := v_fail+1; v_notes := v_notes||' T2:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T3 cross-company store must fail
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s_other, 'store', 'Bad store', 'NL');
      v_fail := v_fail+1; v_notes := v_notes||' T3:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T4 invalid country must fail
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s1, 'store', 'Bad cc', 'nl');
      v_fail := v_fail+1; v_notes := v_notes||' T4:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T5 SE origin must succeed
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s1, 'third_party_fulfillment', '3PL SE', 'SE');
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T5:'||SQLERRM; END;

    -- T6 invalid type must fail
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code)
        VALUES (c1, s1, 'dropship', 'Bad', 'NL');
      v_fail := v_fail+1; v_notes := v_notes||' T6:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T7 invalid status must fail
    BEGIN
      INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
        VALUES (c1, s1, 'store', 'Bad', 'NL', 'enabled');
      v_fail := v_fail+1; v_notes := v_notes||' T7:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code)
      VALUES (c1, s1, 'store', 'Counter', 'NL') RETURNING id INTO o2;
    INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
      VALUES (c1, s1, 'store', 'Old', 'NL', 'retired') RETURNING id INTO o_ret;
    INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code)
      VALUES (c1, s2, 'store', 'S2 origin', 'NL') RETURNING id INTO o_other;

    -- T8 profile must succeed
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles (company_id, merchant_store_id, catalog_sku_id, status)
        VALUES (c1, s1, sku1, 'active') RETURNING id INTO p1;
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T8:'||SQLERRM; END;

    -- T9 cross-company sku must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles (company_id, merchant_store_id, catalog_sku_id)
        VALUES (c1, s1, sku2);
      v_fail := v_fail+1; v_notes := v_notes||' T9:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T10 duplicate active must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles (company_id, merchant_store_id, catalog_sku_id, version, status)
        VALUES (c1, s1, sku1, 2, 'active');
      v_fail := v_fail+1; v_notes := v_notes||' T10:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T11 draft variant with flags must succeed
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_profiles
        (company_id, merchant_store_id, catalog_sku_id, version, status, pickup_only, oversized, dangerous_goods, handling_class)
        VALUES (c1, s1, sku1, 2, 'draft', true, true, true, 'fragile') RETURNING id INTO p2;
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T11:'||SQLERRM; END;

    -- T12 multi-parcel must succeed
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 1, 1, 1200, 400, 300, 200), (p1, c1, s1, 2, 1, 800, 300, 200, 100);
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T12:'||SQLERRM; END;

    -- T13 duplicate package_number must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 2, 1, 500, 100, 100, 100);
      v_fail := v_fail+1; v_notes := v_notes||' T13:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T14 same number other profile must succeed
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p2, c1, s1, 1, 1, 500, 100, 100, 100);
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T14:'||SQLERRM; END;

    -- T15 zero weight must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 9, 1, 0, 100, 100, 100);
      v_fail := v_fail+1; v_notes := v_notes||' T15:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T16 negative dimension must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 10, 1, 500, -1, 100, 100);
      v_fail := v_fail+1; v_notes := v_notes||' T16:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T17 zero quantity must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c1, s1, 11, 0, 500, 100, 100, 100);
      v_fail := v_fail+1; v_notes := v_notes||' T17:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T18 cross-company package must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_shipping_packages
        (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm)
        VALUES (p1, c2, s1, 12, 1, 500, 100, 100, 100);
      v_fail := v_fail+1; v_notes := v_notes||' T18:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T19 assignment must succeed
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default)
        VALUES (p1, o1, c1, s1, 1, true);
      v_pass := v_pass+1;
    EXCEPTION WHEN others THEN v_fail := v_fail+1; v_notes := v_notes||' T19:'||SQLERRM; END;

    -- T20 second default must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default)
        VALUES (p1, o2, c1, s1, 2, true);
      v_fail := v_fail+1; v_notes := v_notes||' T20:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T21 duplicate priority must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o2, c1, s1, 1);
      v_fail := v_fail+1; v_notes := v_notes||' T21:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T22 duplicate profile-origin must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o1, c1, s1, 3);
      v_fail := v_fail+1; v_notes := v_notes||' T22:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T23 cross-store must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o_other, c1, s1, 4);
      v_fail := v_fail+1; v_notes := v_notes||' T23:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T24 cross-company must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o1, c2, s1, 5);
      v_fail := v_fail+1; v_notes := v_notes||' T24:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    -- T25 retired origin must fail
    BEGIN
      INSERT INTO public.merchant_store_sku_fulfillment_origins
        (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority)
        VALUES (p1, o_ret, c1, s1, 6);
      v_fail := v_fail+1; v_notes := v_notes||' T25:accepted';
    EXCEPTION WHEN others THEN v_pass := v_pass+1; END;

    IF v_pass <> 25 OR v_fail <> 0 THEN
      RAISE EXCEPTION 'M1C1B_TESTS_FAILED pass=% fail=% notes=%', v_pass, v_fail, v_notes;
    END IF;

    RAISE EXCEPTION 'M1C1B_ROLLBACK_OK_25_25';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'M1C1B_ROLLBACK_OK_25_25' THEN
      RAISE EXCEPTION 'M1C-1B VERIFICATION FAILED: %', SQLERRM;
    END IF;
  END;

  IF (SELECT count(*) FROM public.merchant_fulfillment_origins)
   + (SELECT count(*) FROM public.merchant_store_sku_shipping_profiles)
   + (SELECT count(*) FROM public.merchant_store_sku_shipping_packages)
   + (SELECT count(*) FROM public.merchant_store_sku_fulfillment_origins) <> 0 THEN
    RAISE EXCEPTION 'M1C-1B ZERO-ROW EVIDENCE FAILED';
  END IF;
END
$outer$;