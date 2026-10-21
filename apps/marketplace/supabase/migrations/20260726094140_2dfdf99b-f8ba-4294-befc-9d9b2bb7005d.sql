CREATE OR REPLACE FUNCTION public._m1b2b_test_suite()
RETURNS TABLE(test_name text, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_std uuid;
  v_red uuid;
  v_admin uuid := '368d803e-d06b-485c-9e3c-e58b168d0419';
  v_pid uuid;
  v_cid uuid;
BEGIN
  SELECT id INTO v_std FROM public.tax_categories WHERE code='standard';
  SELECT id INTO v_red FROM public.tax_categories WHERE code='reduced';
  SELECT id INTO v_pid FROM public.catalog_products LIMIT 1;
  SELECT id INTO v_cid FROM public.companies LIMIT 1;

  -- Use a single outer subtransaction so nothing persists.
  BEGIN
    -- T1: overlapping approved rate versions (same country+category) rejected
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_std, 2100, '2026-01-01','2027-01-01','approved', v_admin, now());
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_std, 2100, '2026-06-01','2027-06-01','approved', v_admin, now());
      test_name := 'T1_overlap_same_country_category_rejected'; result := 'FAIL_not_rejected';
    EXCEPTION WHEN exclusion_violation THEN
      test_name := 'T1_overlap_same_country_category_rejected'; result := 'PASS';
    END;
    RETURN NEXT;

    -- T2: non-overlapping approved windows accepted
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_std, 2100, '2026-01-01','2027-01-01','approved', v_admin, now());
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_std, 2200, '2027-01-01','2028-01-01','approved', v_admin, now());
      test_name := 'T2_adjacent_windows_accepted'; result := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      test_name := 'T2_adjacent_windows_accepted'; result := 'FAIL:'||SQLERRM;
    END;
    RETURN NEXT;

    -- T3: same window, different category accepted
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_std, 2100, '2026-01-01','2027-01-01','approved', v_admin, now());
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_red,  900, '2026-01-01','2027-01-01','approved', v_admin, now());
      test_name := 'T3_diff_category_accepted'; result := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      test_name := 'T3_diff_category_accepted'; result := 'FAIL:'||SQLERRM;
    END;
    RETURN NEXT;

    -- T4: same window, different country accepted
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('NL', v_std, 2100, '2026-01-01','2027-01-01','approved', v_admin, now());
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
        VALUES ('DE', v_std, 1900, '2026-01-01','2027-01-01','approved', v_admin, now());
      test_name := 'T4_diff_country_accepted'; result := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      test_name := 'T4_diff_country_accepted'; result := 'FAIL:'||SQLERRM;
    END;
    RETURN NEXT;

    -- T5: two DRAFT overlapping windows accepted (only approved is guarded)
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
        VALUES ('NL', v_std, 2100, '2026-01-01','2027-01-01','draft');
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
        VALUES ('NL', v_std, 2200, '2026-06-01','2027-06-01','draft');
      test_name := 'T5_drafts_do_not_conflict'; result := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      test_name := 'T5_drafts_do_not_conflict'; result := 'FAIL:'||SQLERRM;
    END;
    RETURN NEXT;

    -- T6: product classification overlap same (product,country) rejected
    IF v_pid IS NULL THEN
      test_name := 'T6_product_overlap_rejected'; result := 'SKIP_no_products';
      RETURN NEXT;
    ELSE
      BEGIN
        INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_category_id, valid_from, valid_to, status, approved_by, approved_at)
          VALUES (v_pid, 'NL', v_std, '2026-01-01','2027-01-01','approved', v_admin, now());
        INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_category_id, valid_from, valid_to, status, approved_by, approved_at)
          VALUES (v_pid, 'NL', v_red, '2026-06-01','2027-06-01','approved', v_admin, now());
        test_name := 'T6_product_overlap_rejected'; result := 'FAIL_not_rejected';
      EXCEPTION WHEN exclusion_violation THEN
        test_name := 'T6_product_overlap_rejected'; result := 'PASS';
      END;
      RETURN NEXT;

      -- T7: same product, diff country accepted
      BEGIN
        INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_category_id, valid_from, valid_to, status, approved_by, approved_at)
          VALUES (v_pid, 'NL', v_std, '2026-01-01','2027-01-01','approved', v_admin, now());
        INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_category_id, valid_from, valid_to, status, approved_by, approved_at)
          VALUES (v_pid, 'DE', v_std, '2026-01-01','2027-01-01','approved', v_admin, now());
        test_name := 'T7_product_diff_country_accepted'; result := 'PASS';
      EXCEPTION WHEN OTHERS THEN
        test_name := 'T7_product_diff_country_accepted'; result := 'FAIL:'||SQLERRM;
      END;
      RETURN NEXT;
    END IF;

    -- T8: valid_to <= valid_from rejected
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
        VALUES ('NL', v_std, 2100, '2027-01-01','2026-01-01','draft');
      test_name := 'T8_invalid_range_rejected'; result := 'FAIL_not_rejected';
    EXCEPTION WHEN check_violation THEN
      test_name := 'T8_invalid_range_rejected'; result := 'PASS';
    END;
    RETURN NEXT;

    -- T9: approved without approver rejected
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
        VALUES ('NL', v_std, 2100, '2026-01-01','2027-01-01','approved');
      test_name := 'T9_approved_requires_approver'; result := 'FAIL_not_rejected';
    EXCEPTION WHEN check_violation THEN
      test_name := 'T9_approved_requires_approver'; result := 'PASS';
    END;
    RETURN NEXT;

    -- T10: bad country_code rejected
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
        VALUES ('nl', v_std, 2100, '2026-01-01','2027-01-01','draft');
      test_name := 'T10_country_code_shape'; result := 'FAIL_not_rejected';
    EXCEPTION WHEN check_violation THEN
      test_name := 'T10_country_code_shape'; result := 'PASS';
    END;
    RETURN NEXT;

    -- T11: negative rate rejected
    BEGIN
      INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
        VALUES ('NL', v_std, -1, '2026-01-01','2027-01-01','draft');
      test_name := 'T11_rate_bounds'; result := 'FAIL_not_rejected';
    EXCEPTION WHEN check_violation THEN
      test_name := 'T11_rate_bounds'; result := 'PASS';
    END;
    RETURN NEXT;

    -- T12: company_tax_profiles vat_pair enforced
    IF v_cid IS NULL THEN
      test_name := 'T12_vat_pair'; result := 'SKIP_no_companies';
    ELSE
      BEGIN
        INSERT INTO public.company_tax_profiles(company_id, vat_number, vat_country)
          VALUES (v_cid, 'NL123', NULL);
        test_name := 'T12_vat_pair'; result := 'FAIL_not_rejected';
      EXCEPTION WHEN check_violation THEN
        test_name := 'T12_vat_pair'; result := 'PASS';
      END;
    END IF;
    RETURN NEXT;

    -- T13: verified requires verifier
    IF v_cid IS NULL THEN
      test_name := 'T13_verified_requires_verifier'; result := 'SKIP_no_companies';
    ELSE
      BEGIN
        INSERT INTO public.company_tax_profiles(company_id, verified) VALUES (v_cid, true);
        test_name := 'T13_verified_requires_verifier'; result := 'FAIL_not_rejected';
      EXCEPTION WHEN check_violation THEN
        test_name := 'T13_verified_requires_verifier'; result := 'PASS';
      END;
    END IF;
    RETURN NEXT;

    -- T14: force rollback of the outer subtransaction so no rows persist
    RAISE EXCEPTION USING ERRCODE = 'raise_exception', MESSAGE = 'M1B2B_ROLLBACK_MARKER';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'M1B2B_ROLLBACK_MARKER' THEN RAISE; END IF;
    -- All inserts done above are now rolled back by the subtransaction abort.
  END;

  -- Post-cleanup evidence
  test_name := 'POST_no_tax_rate_versions';
  result := CASE WHEN (SELECT count(*) FROM public.tax_rate_versions) = 0 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;
  test_name := 'POST_no_product_classifications';
  result := CASE WHEN (SELECT count(*) FROM public.catalog_product_tax_classifications) = 0 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;
  test_name := 'POST_no_company_tax_profiles';
  result := CASE WHEN (SELECT count(*) FROM public.company_tax_profiles) = 0 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  RETURN;
END $$;

-- Execute and log results
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public._m1b2b_test_suite() LOOP
    RAISE NOTICE 'M1B2B_TEST % => %', r.test_name, r.result;
  END LOOP;
END $$;

-- Self-clean: drop the test function so no callable surface remains
DROP FUNCTION public._m1b2b_test_suite();
