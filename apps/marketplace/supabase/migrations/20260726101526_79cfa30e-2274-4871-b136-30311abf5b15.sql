CREATE OR REPLACE FUNCTION public._msop_verify_m1b3b()
RETURNS TABLE(pass_count int, fail_count int, notes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_pass int := 0; v_fail int := 0; v_notes text := '';
  v_uid uuid; v_company_a uuid; v_company_b uuid;
  v_store_a uuid; v_store_b uuid;
  v_product_a uuid; v_product_b uuid;
  v_sku_a uuid; v_sku_b uuid;
  v_price_id uuid; v_price_id2 uuid;
  v_tax_cat uuid; v_tax_cat_other uuid;
  v_rate_ok uuid; v_rate_draft uuid; v_rate_other_country uuid; v_rate_expired uuid; v_rate_other_cat uuid;
  v_suffix text;
BEGIN
  BEGIN
    SELECT id INTO v_uid FROM auth.users LIMIT 1;
    IF v_uid IS NULL THEN v_notes := 'no auth user'; RAISE EXCEPTION 'M1B3B_ROLLBACK'; END IF;

    v_suffix := to_char(floor(random()*1e9)::bigint, 'FM0000000000');

    INSERT INTO public.companies(name, slug, owner_user_id) VALUES ('TCA','tca-'||v_suffix,v_uid) RETURNING id INTO v_company_a;
    INSERT INTO public.companies(name, slug, owner_user_id) VALUES ('TCB','tcb-'||v_suffix||'b',v_uid) RETURNING id INTO v_company_b;
    INSERT INTO public.merchant_stores(company_id, slug, display_name) VALUES (v_company_a,'sa-'||v_suffix,'A') RETURNING id INTO v_store_a;
    INSERT INTO public.merchant_stores(company_id, slug, display_name) VALUES (v_company_b,'sb-'||v_suffix,'B') RETURNING id INTO v_store_b;
    INSERT INTO public.catalog_products(company_id, title, status) VALUES (v_company_a,'P-A','active') RETURNING id INTO v_product_a;
    INSERT INTO public.catalog_products(company_id, title, status) VALUES (v_company_b,'P-B','active') RETURNING id INTO v_product_b;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company_a, v_product_a, 'SA-'||v_suffix) RETURNING id INTO v_sku_a;
    INSERT INTO public.catalog_skus(company_id, product_id, code) VALUES (v_company_b, v_product_b, 'SB-'||v_suffix) RETURNING id INTO v_sku_b;
    INSERT INTO public.tax_categories(code, label) VALUES ('std_'||v_suffix,'std') RETURNING id INTO v_tax_cat;
    INSERT INTO public.tax_categories(code, label) VALUES ('oth_'||v_suffix,'oth') RETURNING id INTO v_tax_cat_other;

    INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
      VALUES ('NL', v_tax_cat, 2100, '2020-01-01', NULL, 'approved', v_uid, now()) RETURNING id INTO v_rate_ok;
    INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status)
      VALUES ('NL', v_tax_cat, 2100, '2020-01-01', NULL, 'draft') RETURNING id INTO v_rate_draft;
    INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
      VALUES ('DE', v_tax_cat, 1900, '2020-01-01', NULL, 'approved', v_uid, now()) RETURNING id INTO v_rate_other_country;
    INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
      VALUES ('NL', v_tax_cat, 2100, '2000-01-01', '2001-01-01', 'approved', v_uid, now()) RETURNING id INTO v_rate_expired;
    INSERT INTO public.tax_rate_versions(country_code, tax_category_id, rate_basis_points, valid_from, valid_to, status, approved_by, approved_at)
      VALUES ('NL', v_tax_cat_other, 900, '2020-01-01', NULL, 'approved', v_uid, now()) RETURNING id INTO v_rate_other_cat;

    INSERT INTO public.catalog_product_tax_classifications(product_id, country_code, tax_category_id, valid_from, valid_to, status, approved_by, approved_at)
      VALUES (v_product_a, 'NL', v_tax_cat, '2020-01-01', NULL, 'approved', v_uid, now());

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',0,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T1;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',-1,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T2;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'nl','EUR',1000,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T3;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','eur',1000,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T4;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1000,'weird',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T5;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from,valid_to) VALUES(v_store_a,v_sku_a,'NL','EUR',1000,'draft',now(),now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T6;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_b,'NL','EUR',1000,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T7;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(gen_random_uuid(),v_sku_a,'NL','EUR',1000,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T8;';
    EXCEPTION WHEN OTHERS THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,gen_random_uuid(),'NL','EUR',1000,'draft',now()); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T9;';
    EXCEPTION WHEN OTHERS THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1999,'draft','2025-01-01'::timestamptz) RETURNING id INTO v_price_id; v_pass:=v_pass+1;
    EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T10 '||SQLERRM||';'; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1999,'active','2025-01-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T11;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1999,v_rate_draft,'active','2025-01-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T12;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1999,v_rate_other_country,'active','2025-01-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T13;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1999,v_rate_expired,'active','2025-01-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T14;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from) VALUES(v_store_b,v_sku_b,'NL','EUR',1999,v_rate_ok,'active','2025-01-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T15;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',1999,v_rate_other_cat,'active','2025-01-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T16;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from) VALUES(v_store_a,v_sku_a,'NL','EUR',2499,v_rate_ok,'active','2025-01-01'::timestamptz) RETURNING id INTO v_price_id; v_pass:=v_pass+1;
    EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T17 '||SQLERRM||';'; END;

    BEGIN UPDATE public.merchant_store_offer_prices SET gross_amount_minor = 3000 WHERE id = v_price_id; v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T18;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    BEGIN UPDATE public.merchant_store_offer_prices SET status='superseded' WHERE id = v_price_id; v_pass:=v_pass+1;
    EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T19 '||SQLERRM||';'; END;

    INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from,valid_to)
      VALUES(v_store_a,v_sku_a,'NL','EUR',2999,v_rate_ok,'active','2025-01-01'::timestamptz,'2025-06-01'::timestamptz) RETURNING id INTO v_price_id2;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from,valid_to) VALUES(v_store_a,v_sku_a,'NL','EUR',3199,v_rate_ok,'active','2025-04-01'::timestamptz,'2025-08-01'::timestamptz); v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T20;';
    EXCEPTION WHEN exclusion_violation THEN v_pass:=v_pass+1; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,tax_rate_version_id,status,valid_from,valid_to) VALUES(v_store_a,v_sku_a,'NL','EUR',3199,v_rate_ok,'active','2025-06-01'::timestamptz,NULL); v_pass:=v_pass+1;
    EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T21 '||SQLERRM||';'; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from) VALUES(v_store_a,v_sku_a,'BE','EUR',3199,'draft','2025-01-01'::timestamptz); v_pass:=v_pass+1;
    EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T21b '||SQLERRM||';'; END;

    BEGIN INSERT INTO public.merchant_store_offer_prices(merchant_store_id,catalog_sku_id,destination_country_code,currency_code,gross_amount_minor,status,valid_from,valid_to) VALUES(v_store_a,v_sku_a,'NL','EUR',3199,'draft','2025-01-01'::timestamptz,'2025-12-01'::timestamptz); v_pass:=v_pass+1;
    EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T22 '||SQLERRM||';'; END;

    BEGIN UPDATE public.merchant_store_offer_prices SET supersedes_price_id = id WHERE id = v_price_id2; v_fail:=v_fail+1; v_notes:=v_notes||'FAIL T23;';
    EXCEPTION WHEN check_violation THEN v_pass:=v_pass+1; END;

    RAISE EXCEPTION 'M1B3B_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'M1B3B_ROLLBACK' THEN
      v_notes := v_notes || 'ABORT:' || SQLERRM || ';';
    END IF;
  END;

  pass_count := v_pass; fail_count := v_fail; notes := v_notes;
  RETURN NEXT;
END
$fn$;
