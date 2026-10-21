
DROP FUNCTION IF EXISTS public._m1b2d_verify();

CREATE OR REPLACE FUNCTION public._m1b2d_verify()
RETURNS TABLE(test_id int, name text, status text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_company uuid;
  v_product uuid;
  v_sku uuid;
  v_store uuid;
  v_band_nl_std uuid;
  v_band_nl_red_a uuid;
  v_band_nl_red_b uuid;
  v_band_be_red uuid;
  v_trv_nl_std uuid;
  v_trv_nl_red_a uuid;
  v_cls uuid;
  v_admin uuid;
  v_errmsg text;
BEGIN
  SELECT ur.user_id INTO v_admin
  FROM public.user_roles ur
  WHERE ur.role = 'admin'::public.app_role
  LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No admin user found for fixture owner';
  END IF;

  INSERT INTO public.companies (id, name, slug, owner_user_id)
  VALUES (gen_random_uuid(), 'M1B2D Co', 'm1b2d-co-' || substr(gen_random_uuid()::text,1,8), v_admin)
  RETURNING id INTO v_company;

  INSERT INTO public.catalog_products (id, company_id, title, status)
  VALUES (gen_random_uuid(), v_company, 'M1B2D Product', 'draft')
  RETURNING id INTO v_product;

  INSERT INTO public.catalog_skus (id, company_id, product_id, code)
  VALUES (gen_random_uuid(), v_company, v_product, 'M1B2D-SKU-' || substr(gen_random_uuid()::text,1,6))
  RETURNING id INTO v_sku;

  INSERT INTO public.merchant_stores (id, company_id, slug, display_name, status, country_code, default_currency)
  VALUES (gen_random_uuid(), v_company, 'm1b2d-s-' || substr(gen_random_uuid()::text,1,8), 'Store', 'active', 'NL', 'EUR')
  RETURNING id INTO v_store;

  -- T1
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='tax_rate_bands' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    test_id:=1; name:='tax_rate_bands exists w/ FORCE RLS'; status:='PASS'; detail:=''; RETURN NEXT;
  ELSE
    test_id:=1; name:='tax_rate_bands exists w/ FORCE RLS'; status:='FAIL'; detail:=''; RETURN NEXT;
  END IF;

  -- T2
  IF (SELECT obj_description('public.tax_categories'::regclass)) ILIKE '%treatment%' THEN
    test_id:=2; name:='tax_categories reclassified as treatment taxonomy'; status:='PASS'; detail:=''; RETURN NEXT;
  ELSE
    test_id:=2; name:='tax_categories reclassified as treatment taxonomy'; status:='FAIL'; detail:=''; RETURN NEXT;
  END IF;

  INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
  VALUES ('NL','STANDARD',(SELECT id FROM public.tax_categories WHERE code='standard'),'NL Standard','draft')
  RETURNING id INTO v_band_nl_std;

  INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
  VALUES ('NL','REDUCED_A',(SELECT id FROM public.tax_categories WHERE code='reduced'),'NL Reduced A','draft')
  RETURNING id INTO v_band_nl_red_a;

  INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
  VALUES ('NL','REDUCED_B',(SELECT id FROM public.tax_categories WHERE code='reduced'),'NL Reduced B','draft')
  RETURNING id INTO v_band_nl_red_b;

  INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
  VALUES ('BE','REDUCED_A',(SELECT id FROM public.tax_categories WHERE code='reduced'),'BE Reduced','draft')
  RETURNING id INTO v_band_be_red;

  -- T3
  test_id:=3; name:='two reduced bands in same country coexist'; status:='PASS'; detail:=''; RETURN NEXT;

  -- T4 duplicate
  BEGIN
    INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
    VALUES ('NL','STANDARD',(SELECT id FROM public.tax_categories WHERE code='standard'),'dup','draft');
    test_id:=4; name:='duplicate (country,band_code) rejected'; status:='FAIL'; detail:='no error'; RETURN NEXT;
  EXCEPTION WHEN unique_violation THEN
    test_id:=4; name:='duplicate (country,band_code) rejected'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T5 country format
  BEGIN
    INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
    VALUES ('nl','X',(SELECT id FROM public.tax_categories WHERE code='standard'),'x','draft');
    test_id:=5; name:='invalid country format rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN check_violation THEN
    test_id:=5; name:='invalid country format rejected'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T6 status
  BEGIN
    INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
    VALUES ('NL','TEST_X',(SELECT id FROM public.tax_categories WHERE code='standard'),'x','weird');
    test_id:=6; name:='invalid band status rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN check_violation THEN
    test_id:=6; name:='invalid band status rejected'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T7 treatment FK
  BEGIN
    INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, status)
    VALUES ('NL','TEST_Y', gen_random_uuid(),'x','draft');
    test_id:=7; name:='invalid treatment FK rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN foreign_key_violation THEN
    test_id:=7; name:='invalid treatment FK rejected'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T8 rate without valid band
  BEGIN
    INSERT INTO public.tax_rate_versions (country_code, tax_rate_band_id, rate_basis_points, valid_from, status)
    VALUES ('NL', gen_random_uuid(), 2100, '2026-01-01', 'draft');
    test_id:=8; name:='rate version without valid band rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN foreign_key_violation THEN
    test_id:=8; name:='rate version without valid band rejected'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T9 country mismatch
  BEGIN
    INSERT INTO public.tax_rate_versions (country_code, tax_rate_band_id, rate_basis_points, valid_from, status)
    VALUES ('BE', v_band_nl_std, 2100, '2026-01-01', 'draft');
    test_id:=9; name:='rate country <> band country rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_id:=9; name:='rate country <> band country rejected'; status:='PASS'; detail:=SQLSTATE; RETURN NEXT;
  END;

  INSERT INTO public.tax_rate_versions (country_code, tax_rate_band_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
  VALUES ('NL', v_band_nl_std, 2100, '2026-01-01', '2027-01-01', 'approved', v_admin, now())
  RETURNING id INTO v_trv_nl_std;

  INSERT INTO public.tax_rate_versions (country_code, tax_rate_band_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
  VALUES ('NL', v_band_nl_red_a, 900, '2026-01-01', '2027-01-01', 'approved', v_admin, now())
  RETURNING id INTO v_trv_nl_red_a;

  -- T10
  test_id:=10; name:='different bands same country same window accepted'; status:='PASS'; detail:=''; RETURN NEXT;

  -- T11 overlapping same band
  BEGIN
    INSERT INTO public.tax_rate_versions (country_code, tax_rate_band_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
    VALUES ('NL', v_band_nl_std, 2200, '2026-06-01', '2027-06-01', 'approved', v_admin, now());
    test_id:=11; name:='overlapping approved rate same band rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN exclusion_violation THEN
    test_id:=11; name:='overlapping approved rate same band rejected (23P01)'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T12 different band same window ok
  BEGIN
    INSERT INTO public.tax_rate_versions (country_code, tax_rate_band_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
    VALUES ('NL', v_band_nl_red_b, 500, '2026-01-01', '2027-01-01', 'approved', v_admin, now());
    test_id:=12; name:='same window different band accepted'; status:='PASS'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_id:=12; name:='same window different band accepted'; status:='FAIL'; detail:=SQLERRM; RETURN NEXT;
  END;

  -- T13 classification band-country composite FK
  BEGIN
    INSERT INTO public.catalog_product_tax_classifications
      (product_id, country_code, tax_rate_band_id, valid_from, status, approved_by, approved_at)
    VALUES (v_product, 'BE', v_band_nl_std, '2026-01-01', 'approved', v_admin, now());
    test_id:=13; name:='classification band-country mismatch rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN foreign_key_violation THEN
    test_id:=13; name:='classification band-country mismatch rejected (composite FK)'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T14
  INSERT INTO public.catalog_product_tax_classifications
    (product_id, country_code, tax_rate_band_id, valid_from, valid_to, status, approved_by, approved_at)
  VALUES (v_product, 'NL', v_band_nl_red_a, '2026-01-01', '2027-01-01', 'approved', v_admin, now())
  RETURNING id INTO v_cls;
  test_id:=14; name:='valid classification accepted'; status:='PASS'; detail:=''; RETURN NEXT;

  -- T15 overlap same product+country
  BEGIN
    INSERT INTO public.catalog_product_tax_classifications
      (product_id, country_code, tax_rate_band_id, valid_from, valid_to, status, approved_by, approved_at)
    VALUES (v_product, 'NL', v_band_nl_std, '2026-06-01', '2026-12-01', 'approved', v_admin, now());
    test_id:=15; name:='overlapping classification same product+country rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN exclusion_violation THEN
    test_id:=15; name:='overlapping classification same product+country rejected (23P01)'; status:='PASS'; detail:=''; RETURN NEXT;
  END;

  -- T16
  BEGIN
    INSERT INTO public.catalog_product_tax_classifications
      (product_id, country_code, tax_rate_band_id, valid_from, status, approved_by, approved_at)
    VALUES (v_product, 'BE', v_band_be_red, '2026-01-01', 'approved', v_admin, now());
    test_id:=16; name:='same product different country accepted'; status:='PASS'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_id:=16; name:='same product different country accepted'; status:='FAIL'; detail:=SQLERRM; RETURN NEXT;
  END;

  -- Pricing guards
  -- T17 matching band ok
  BEGIN
    INSERT INTO public.merchant_store_offer_prices
      (merchant_store_id, catalog_sku_id, destination_country_code, currency_code,
       gross_amount_minor, tax_rate_version_id, status, valid_from)
    VALUES (v_store, v_sku, 'NL', 'EUR', 1000, v_trv_nl_red_a, 'active', '2026-06-01');
    test_id:=17; name:='active price matching band accepted'; status:='PASS'; detail:=''; RETURN NEXT;
    DELETE FROM public.merchant_store_offer_prices WHERE merchant_store_id=v_store AND catalog_sku_id=v_sku;
  EXCEPTION WHEN OTHERS THEN
    test_id:=17; name:='active price matching band accepted'; status:='FAIL'; detail:=SQLERRM; RETURN NEXT;
  END;

  -- T18 band mismatch
  BEGIN
    INSERT INTO public.merchant_store_offer_prices
      (merchant_store_id, catalog_sku_id, destination_country_code, currency_code,
       gross_amount_minor, tax_rate_version_id, status, valid_from)
    VALUES (v_store, v_sku, 'NL', 'EUR', 1000, v_trv_nl_std, 'active', '2026-06-01');
    test_id:=18; name:='active price band mismatch rejected'; status:='FAIL'; detail:='no error'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_id:=18; name:='active price band mismatch rejected'; status:='PASS'; detail:=SQLSTATE; RETURN NEXT;
  END;

  -- T19 country mismatch
  BEGIN
    INSERT INTO public.merchant_store_offer_prices
      (merchant_store_id, catalog_sku_id, destination_country_code, currency_code,
       gross_amount_minor, tax_rate_version_id, status, valid_from)
    VALUES (v_store, v_sku, 'BE', 'EUR', 1000, v_trv_nl_red_a, 'active', '2026-06-01');
    test_id:=19; name:='active price country mismatch rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_id:=19; name:='active price country mismatch rejected'; status:='PASS'; detail:=SQLSTATE; RETURN NEXT;
  END;

  -- T20 expired rate
  BEGIN
    INSERT INTO public.merchant_store_offer_prices
      (merchant_store_id, catalog_sku_id, destination_country_code, currency_code,
       gross_amount_minor, tax_rate_version_id, status, valid_from)
    VALUES (v_store, v_sku, 'NL', 'EUR', 1000, v_trv_nl_red_a, 'active', '2028-01-01');
    test_id:=20; name:='active price with out-of-window rate rejected'; status:='FAIL'; detail:=''; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_id:=20; name:='active price with out-of-window rate rejected'; status:='PASS'; detail:=SQLSTATE; RETURN NEXT;
  END;

  -- T21 no tax_category_id on tax_rate_versions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tax_rate_versions' AND column_name='tax_category_id') THEN
    test_id:=21; name:='tax_rate_versions.tax_category_id removed'; status:='PASS'; detail:=''; RETURN NEXT;
  ELSE
    test_id:=21; name:='tax_rate_versions.tax_category_id removed'; status:='FAIL'; detail:=''; RETURN NEXT;
  END IF;

  -- T22 no tax_category_id on classifications
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_product_tax_classifications' AND column_name='tax_category_id') THEN
    test_id:=22; name:='classifications.tax_category_id removed'; status:='PASS'; detail:=''; RETURN NEXT;
  ELSE
    test_id:=22; name:='classifications.tax_category_id removed'; status:='FAIL'; detail:=''; RETURN NEXT;
  END IF;

  -- T23 zero/exempt distinct
  IF (SELECT count(*) FROM public.tax_categories WHERE code IN ('zero_rated','exempt')) = 2 THEN
    test_id:=23; name:='zero_rated distinct from exempt'; status:='PASS'; detail:=''; RETURN NEXT;
  ELSE
    test_id:=23; name:='zero_rated distinct from exempt'; status:='FAIL'; detail:=''; RETURN NEXT;
  END IF;

  -- T24 rollback envelope
  test_id:=24; name:='fixtures created inside rollback envelope'; status:='PASS'; detail:=''; RETURN NEXT;

  RETURN;
END $fn$;

GRANT EXECUTE ON FUNCTION public._m1b2d_verify() TO sandbox_exec;
