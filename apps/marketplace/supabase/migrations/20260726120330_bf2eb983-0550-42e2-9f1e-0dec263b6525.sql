CREATE OR REPLACE FUNCTION public._m1b3c4_verify()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_res text[] := '{}';
  v_admin uuid;
  v_company uuid;
  v_store uuid;
  v_b_nl_std uuid; v_b_nl_red uuid; v_b_nl_zero uuid; v_b_nl_exempt uuid;
  v_b_be_std uuid; v_b_be_red uuid;
  v_rv_nl_std uuid; v_rv_nl_red uuid; v_rv_nl_zero uuid; v_rv_nl_exempt uuid;
  v_rv_be_std uuid; v_rv_be_red uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid;
  v_k1 uuid; v_k2 uuid; v_k3 uuid; v_k4 uuid; v_k5 uuid; v_k6 uuid; v_k7 uuid;
  v_cls1 uuid;
  v_tmp uuid;
  v_err text;
  r record;
BEGIN
  SELECT id INTO v_admin FROM auth.users ORDER BY created_at LIMIT 1;

  SELECT id INTO v_b_nl_std    FROM public.tax_rate_bands WHERE country_code='NL' AND band_code='STANDARD';
  SELECT id INTO v_b_nl_red    FROM public.tax_rate_bands WHERE country_code='NL' AND band_code='REDUCED_A';
  SELECT id INTO v_b_nl_zero   FROM public.tax_rate_bands WHERE country_code='NL' AND band_code='ZERO';
  SELECT id INTO v_b_nl_exempt FROM public.tax_rate_bands WHERE country_code='NL' AND band_code='EXEMPT';
  SELECT id INTO v_b_be_std    FROM public.tax_rate_bands WHERE country_code='BE' AND band_code='STANDARD';
  SELECT id INTO v_b_be_red    FROM public.tax_rate_bands WHERE country_code='BE' AND band_code='REDUCED_A';

  BEGIN  -- ===== fixture subtransaction (always rolled back) =====

    -- ---- negative constraint tests -------------------------------------
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, status, legal_effective_date_status)
      VALUES ('NL', v_b_nl_std, 2100, DATE '2026-01-01', 'draft', 'verified');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T5 verified without legal date rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T5 verified without legal date rejected|true|check_violation';
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, status, legal_effective_from, legal_effective_date_status, verified_at, verified_by)
      VALUES ('NL', v_b_nl_std, 2100, DATE '2026-01-01', 'draft', DATE '2012-10-01', 'verified', now(), v_admin);
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T6 verified without source rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T6 verified without source rejected|true|check_violation';
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, status, legal_effective_from, legal_effective_to)
      VALUES ('NL', v_b_nl_std, 2100, DATE '2026-01-01', 'draft', DATE '2012-10-01', DATE '2011-01-01');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T7 invalid legal range rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T7 invalid legal range rejected|true|check_violation';
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, status, legal_effective_to)
      VALUES ('NL', v_b_nl_std, 2100, DATE '2026-01-01', 'draft', DATE '2011-01-01');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T7b legal_to without legal_from rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T7b legal_to without legal_from rejected|true|check_violation';
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, platform_valid_to, status)
      VALUES ('NL', v_b_nl_std, 2100, DATE '2026-01-01', DATE '2025-01-01', 'draft');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T8 invalid platform range rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T8 invalid platform range rejected|true|check_violation';
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, status)
      VALUES ('BE', v_b_nl_std, 2100, DATE '2026-01-01', 'draft');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T-band-country mismatch rejected|false|accepted';
    EXCEPTION WHEN others THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T-band-country mismatch rejected|true|' || SQLSTATE;
    END;

    -- ---- draft acceptance + no legal-date copying ----------------------
    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, status)
    VALUES ('NL', v_b_nl_zero, 0, DATE '2026-01-01', 'draft')
    RETURNING id INTO v_tmp;
    v_res[coalesce(array_length(v_res,1),0)+1] := 'T13 draft rate with NULL legal dates accepted|true|inserted (rolled back)';

    SELECT (legal_effective_from IS NULL AND legal_effective_to IS NULL
            AND legal_effective_date_status='unverified' AND verified_at IS NULL) INTO r
      FROM public.tax_rate_versions WHERE id = v_tmp;
    v_res[coalesce(array_length(v_res,1),0)+1] := ('T14 platform dates not copied to legal dates|' || r::text || '|legal metadata stayed NULL/unverified');
    DELETE FROM public.tax_rate_versions WHERE id = v_tmp;

    -- ---- exclusion constraint behaviour -------------------------------
    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, platform_valid_to, status, approved_by, approved_at)
    VALUES ('NL', v_b_nl_zero, 0, DATE '2026-01-01', DATE '2026-06-01', 'approved', v_admin, now());

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, platform_valid_to, status, approved_by, approved_at)
      VALUES ('NL', v_b_nl_zero, 0, DATE '2026-03-01', DATE '2026-09-01', 'approved', v_admin, now());
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T10 overlapping platform window same band rejected (23P01)|false|accepted';
    EXCEPTION WHEN exclusion_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T10 overlapping platform window same band rejected (23P01)|true|23P01';
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, status, approved_by, approved_at)
      VALUES ('NL', v_b_nl_zero, 0, DATE '2026-06-01', 'approved', v_admin, now());
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T11 non-overlapping window same band accepted|true|accepted (rate change => new version)';
    EXCEPTION WHEN others THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T11 non-overlapping window same band accepted|false|' || SQLSTATE);
    END;

    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
        platform_valid_from, platform_valid_to, status, approved_by, approved_at)
      VALUES ('NL', v_b_nl_exempt, 0, DATE '2026-01-01', DATE '2026-06-01', 'approved', v_admin, now());
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T12 same window on a different band accepted|true|accepted';
    EXCEPTION WHEN others THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T12 same window on a different band accepted|false|' || SQLSTATE);
    END;

    DELETE FROM public.tax_rate_versions WHERE tax_rate_band_id IN (v_b_nl_zero, v_b_nl_exempt);

    -- ---- pricing-guard fixtures ---------------------------------------
    INSERT INTO public.companies(name, slug, owner_user_id)
    VALUES ('M1B3C4 Test Co', 'm1b3c4-test-co', v_admin) RETURNING id INTO v_company;

    INSERT INTO public.merchant_stores(company_id, slug, display_name, status, country_code)
    VALUES (v_company, 'm1b3c4-test-store', 'M1B3C4 Test Store', 'draft', 'NL')
    RETURNING id INTO v_store;

    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P1') RETURNING id INTO v_p1;
    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P2') RETURNING id INTO v_p2;
    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P3') RETURNING id INTO v_p3;
    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P4') RETURNING id INTO v_p4;
    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P5') RETURNING id INTO v_p5;
    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P6') RETURNING id INTO v_p6;
    INSERT INTO public.catalog_products(company_id, title) VALUES (v_company,'P7') RETURNING id INTO v_p7;

    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p1,'K1') RETURNING id INTO v_k1;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p2,'K2') RETURNING id INTO v_k2;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p3,'K3') RETURNING id INTO v_k3;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p4,'K4') RETURNING id INTO v_k4;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p5,'K5') RETURNING id INTO v_k5;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p6,'K6') RETURNING id INTO v_k6;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company,v_p7,'K7') RETURNING id INTO v_k7;

    -- rate versions (approved, platform windows)
    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, status, approved_by, approved_at)
    VALUES ('NL', v_b_nl_std, 2100, DATE '2026-01-01', 'approved', v_admin, now()) RETURNING id INTO v_rv_nl_std;

    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, platform_valid_to, status, approved_by, approved_at)
    VALUES ('NL', v_b_nl_red, 900, DATE '2026-01-01', DATE '2026-03-01', 'approved', v_admin, now()) RETURNING id INTO v_rv_nl_red;

    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, status, approved_by, approved_at)
    VALUES ('NL', v_b_nl_zero, 0, DATE '2026-01-01', 'approved', v_admin, now()) RETURNING id INTO v_rv_nl_zero;

    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, status, approved_by, approved_at)
    VALUES ('NL', v_b_nl_exempt, 0, DATE '2026-01-01', 'approved', v_admin, now()) RETURNING id INTO v_rv_nl_exempt;

    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, status, approved_by, approved_at)
    VALUES ('BE', v_b_be_std, 2100, DATE '2026-01-01', 'approved', v_admin, now()) RETURNING id INTO v_rv_be_std;

    INSERT INTO public.tax_rate_versions(country_code, tax_rate_band_id, rate_basis_points,
      platform_valid_from, status, approved_by, approved_at)
    VALUES ('BE', v_b_be_red, 600, DATE '2026-01-01', 'approved', v_admin, now()) RETURNING id INTO v_rv_be_red;

    -- classifications
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, status, approved_by, approved_at)
    VALUES (v_p1,'NL',v_b_nl_std, DATE '2026-01-01','approved',v_admin, now()) RETURNING id INTO v_cls1;
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, status, approved_by, approved_at)
    VALUES (v_p2,'NL',v_b_nl_std, DATE '2026-01-01','approved',v_admin, now());
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, status, approved_by, approved_at)
    VALUES (v_p3,'NL',v_b_nl_zero, DATE '2026-01-01','approved',v_admin, now());
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, status, approved_by, approved_at)
    VALUES (v_p4,'NL',v_b_nl_exempt, DATE '2026-01-01','approved',v_admin, now());
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, valid_to, status, approved_by, approved_at)
    VALUES (v_p5,'NL',v_b_nl_std, DATE '2026-01-01', DATE '2026-02-01','approved',v_admin, now());
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, status, approved_by, approved_at)
    VALUES (v_p6,'NL',v_b_nl_red, DATE '2026-01-01','approved',v_admin, now());
    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
      valid_from, status, approved_by, approved_at)
    VALUES (v_p7,'BE',v_b_be_red, DATE '2026-01-01','approved',v_admin, now());

    -- T15 standard rate + matching classification inside platform window => accepted
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k1, 'NL','EUR', 1999, v_rv_nl_std, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T15 standard rate inside platform window accepted|true|accepted';
    EXCEPTION WHEN others THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T15 standard rate inside platform window accepted|false|' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- T16 price before platform window => rejected (no backdating)
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k2, 'NL','EUR', 1999, v_rv_nl_std, 'active', TIMESTAMPTZ '2025-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T16 price before platform window rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T16 price before platform window rejected|true|' || SQLERRM);
    END;

    -- T17 price after ended platform window => rejected
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k6, 'NL','EUR', 1999, v_rv_nl_red, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T17 price after ended platform window rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T17 price after ended platform window rejected|true|' || SQLERRM);
    END;

    -- T18 classification window not valid at price date => rejected
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k5, 'NL','EUR', 1999, v_rv_nl_std, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T18 expired classification window rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T18 expired classification window rejected|true|' || SQLERRM);
    END;

    -- T19 band mismatch (rate NL standard, classification NL reduced) => rejected
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k6, 'NL','EUR', 1999, v_rv_nl_std, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T19 band mismatch rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T19 band mismatch rejected|true|' || SQLERRM);
    END;

    -- T20 country mismatch (BE rate, NL destination) => rejected
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k2, 'NL','EUR', 1999, v_rv_be_std, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T20 country mismatch rejected|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T20 country mismatch rejected|true|' || SQLERRM);
    END;

    -- T21 zero_rated band rejected in B2C baseline
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k3, 'NL','EUR', 1999, v_rv_nl_zero, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T21 zero band rejected in B2C baseline|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T21 zero band rejected in B2C baseline|true|' || SQLERRM);
    END;

    -- T22 exempt band rejected in B2C baseline
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k4, 'NL','EUR', 1999, v_rv_nl_exempt, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T22 exempt band rejected in B2C baseline|false|accepted';
    EXCEPTION WHEN check_violation THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T22 exempt band rejected in B2C baseline|true|' || SQLERRM);
    END;

    -- T23 reduced band accepted with sound fixtures (BE)
    BEGIN
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k7, 'BE','EUR', 1999, v_rv_be_red, 'active', TIMESTAMPTZ '2026-06-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T23 reduced band accepted with sound fixtures|true|accepted';
    EXCEPTION WHEN others THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T23 reduced band accepted with sound fixtures|false|' || SQLSTATE || ' ' || SQLERRM);
    END;

    -- T24 product-scope change requires no new rate version
    BEGIN
      UPDATE public.catalog_product_tax_classifications
         SET valid_to = DATE '2026-05-01'
       WHERE id = v_cls1;
      INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_rate_band_id,
        valid_from, status, approved_by, approved_at)
      VALUES (v_p1,'NL',v_b_nl_std, DATE '2026-05-01','approved',v_admin, now());
      INSERT INTO public.merchant_store_offer_prices(merchant_store_id, catalog_sku_id,
        destination_country_code, currency_code, gross_amount_minor, tax_rate_version_id, status, valid_from)
      VALUES (v_store, v_k1, 'NL','USD', 1999, v_rv_nl_std, 'active', TIMESTAMPTZ '2026-07-01 00:00:00+00');
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T24 product-scope change needs no new rate version|true|classification close/open only, same rate version accepted';
    EXCEPTION WHEN others THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('T24 product-scope change needs no new rate version|false|' || SQLSTATE || ' ' || SQLERRM);
    END;

    RAISE EXCEPTION 'M1B3C4_FIXTURE_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'M1B3C4_FIXTURE_ROLLBACK' THEN
      v_res[coalesce(array_length(v_res,1),0)+1] := ('FIXTURE ABORTED UNEXPECTEDLY|false|' || SQLSTATE || ' ' || SQLERRM);
    ELSE
      v_res[coalesce(array_length(v_res,1),0)+1] := 'T-rollback all fixtures rolled back|true|sentinel abort';
    END IF;
  END;

  -- zero-data confirmation after rollback
  v_res[coalesce(array_length(v_res,1),0)+1] := ('T-zero-data persistent counts|' ||
    ((SELECT count(*) FROM public.tax_rate_versions) = 0
     AND (SELECT count(*) FROM public.catalog_product_tax_classifications) = 0
     AND (SELECT count(*) FROM public.company_tax_profiles) = 0
     AND (SELECT count(*) FROM public.merchant_store_offer_prices) = 0
     AND (SELECT count(*) FROM public.borvat_direct_listing_publications) = 0
     AND (SELECT count(*) FROM public.tax_rate_bands) = 9)::text
    || '|versions/cls/profiles/prices/pubs=0, bands=9');

  FOR i IN 1 .. array_length(v_res,1) LOOP
    test_name := split_part(v_res[i],'|',1);
    passed    := split_part(v_res[i],'|',2) = 'true';
    detail    := split_part(v_res[i],'|',3);
    RETURN NEXT;
  END LOOP;
END
$fn$;

REVOKE ALL ON FUNCTION public._m1b3c4_verify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._m1b3c4_verify() FROM anon;
REVOKE ALL ON FUNCTION public._m1b3c4_verify() FROM authenticated;
GRANT EXECUTE ON FUNCTION public._m1b3c4_verify() TO sandbox_exec;