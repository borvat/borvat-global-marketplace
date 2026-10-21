DO $harness$
DECLARE
  v_fail text[] := '{}';
  v_co_a uuid; v_co_b uuid;
  v_st_a uuid := gen_random_uuid(); v_st_b uuid := gen_random_uuid();
  v_or_a uuid := gen_random_uuid(); v_or_b uuid := gen_random_uuid();
  v_p1 uuid := gen_random_uuid(); v_p2 uuid := gen_random_uuid();
  v_cal_o uuid := gen_random_uuid(); v_cal_c uuid := gen_random_uuid(); v_cal_d uuid := gen_random_uuid();
  v_cal_x uuid := gen_random_uuid();
  v_n integer;
  d integer;
BEGIN
  BEGIN
    SELECT id INTO v_co_a FROM public.companies ORDER BY created_at LIMIT 1;
    SELECT id INTO v_co_b FROM public.companies WHERE id <> v_co_a ORDER BY created_at LIMIT 1;
    IF v_co_a IS NULL OR v_co_b IS NULL THEN
      RAISE EXCEPTION 'M1C1DD harness: two companies required';
    END IF;

    INSERT INTO public.merchant_stores (id, company_id, slug, display_name, country_code)
      VALUES (v_st_a, v_co_a, 'm1c1dd-fixture-a', 'M1C1DD Fixture A', 'NL'),
             (v_st_b, v_co_b, 'm1c1dd-fixture-b', 'M1C1DD Fixture B', 'BE');

    INSERT INTO public.merchant_fulfillment_origins
      (id, company_id, merchant_store_id, origin_type, label, country_code, status)
      VALUES (v_or_a, v_co_a, v_st_a, 'store', 'M1C1DD Origin A', 'NL', 'active'),
             (v_or_b, v_co_b, v_st_b, 'store', 'M1C1DD Origin B', 'BE', 'active');

    -- T1 platform scope may not carry tenancy
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, origin_country_code, destination_country_code)
        VALUES ('platform', v_co_a, v_st_a, 'neg-platform-tenant', 1, 'POSTNL', 'STD', 'origin_country', 'NL', 'SE');
      v_fail := v_fail || 'T1 platform scope with tenancy accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T2 merchant scope requires tenancy
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, origin_country_code, destination_country_code)
        VALUES ('merchant_store', 'neg-merchant-no-tenant', 1, 'POSTNL', 'STD', 'origin_country', 'NL', 'SE');
      v_fail := v_fail || 'T2 merchant scope without tenancy accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T3 exact origin requires merchant scope
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES ('platform', 'neg-platform-exact', 1, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'NL', 'SE');
      v_fail := v_fail || 'T3 platform exact_origin accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T4 cross-tenant origin rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES ('merchant_store', v_co_a, v_st_a, 'neg-cross-origin', 1, 'POSTNL', 'STD', 'exact_origin', v_or_b, 'BE', 'SE');
      v_fail := v_fail || 'T4 cross-tenant origin accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T5 exact origin country mismatch rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES ('merchant_store', v_co_a, v_st_a, 'neg-country-mismatch', 1, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'DE', 'SE');
      v_fail := v_fail || 'T5 origin country mismatch accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T6 invalid carrier code
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES ('merchant_store', v_co_a, v_st_a, 'neg-carrier', 1, 'postnl!', 'STD', 'exact_origin', v_or_a, 'NL', 'SE');
      v_fail := v_fail || 'T6 invalid carrier code accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T7 invalid destination country code
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES ('merchant_store', v_co_a, v_st_a, 'neg-country', 1, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'NL', 'swe');
      v_fail := v_fail || 'T7 invalid destination country accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T8 Sweden destination accepted (baseline profile)
    INSERT INTO public.shipping_transit_time_profiles
      (id, scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
       origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
      VALUES (v_p1, 'merchant_store', v_co_a, v_st_a, 'nl-se-standard', 1, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'NL', 'SE');

    -- T9 duplicate version rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES ('merchant_store', v_co_a, v_st_a, 'nl-se-standard', 1, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'NL', 'SE');
      v_fail := v_fail || 'T9 duplicate version accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T10 invalid supersession (different service) rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code, supersedes_profile_id)
        VALUES ('merchant_store', v_co_a, v_st_a, 'nl-se-standard', 2, 'POSTNL', 'EXPRESS', 'exact_origin', v_or_a, 'NL', 'SE', v_p1);
      v_fail := v_fail || 'T10 cross-family supersession accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T11 non-increasing supersession version rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code, supersedes_profile_id)
        VALUES ('merchant_store', v_co_a, v_st_a, 'nl-se-standard', 1, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'NL', 'SE', v_p1);
      v_fail := v_fail || 'T11 non-increasing supersession accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T12..T16 weekday rule contracts
    BEGIN
      INSERT INTO public.shipping_transit_time_weekday_rules
        (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported, transit_min_business_days, transit_max_business_days)
        VALUES (v_p1, 8, true, 1, 2);
      v_fail := v_fail || 'T12 weekday 8 accepted';
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN
      INSERT INTO public.shipping_transit_time_weekday_rules
        (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported)
        VALUES (v_p1, 1, true);
      v_fail := v_fail || 'T13 supported handover without min/max accepted';
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN
      INSERT INTO public.shipping_transit_time_weekday_rules
        (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported, transit_min_business_days, transit_max_business_days)
        VALUES (v_p1, 1, false, 1, 2);
      v_fail := v_fail || 'T14 unsupported handover with min/max accepted';
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN
      INSERT INTO public.shipping_transit_time_weekday_rules
        (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported, transit_min_business_days, transit_max_business_days)
        VALUES (v_p1, 1, true, 4, 2);
      v_fail := v_fail || 'T15 max < min accepted';
    EXCEPTION WHEN others THEN NULL; END;

    FOR d IN 1..7 LOOP
      IF d <= 5 THEN
        INSERT INTO public.shipping_transit_time_weekday_rules
          (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported, transit_min_business_days, transit_max_business_days)
          VALUES (v_p1, d, true, 1, 3);
      ELSE
        INSERT INTO public.shipping_transit_time_weekday_rules
          (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported)
          VALUES (v_p1, d, false);
      END IF;
    END LOOP;

    BEGIN
      INSERT INTO public.shipping_transit_time_weekday_rules
        (shipping_transit_time_profile_id, handover_weekday_iso, handover_supported, transit_min_business_days, transit_max_business_days)
        VALUES (v_p1, 1, true, 1, 3);
      v_fail := v_fail || 'T16 duplicate handover weekday accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T17 activation without delivery weekdays rejected
    BEGIN
      UPDATE public.shipping_transit_time_profiles SET status = 'active' WHERE id = v_p1;
      SET CONSTRAINTS ALL IMMEDIATE;
      v_fail := v_fail || 'T17 activation without delivery weekdays accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T18/T19 delivery weekday contracts
    BEGIN
      INSERT INTO public.shipping_transit_delivery_weekdays
        (shipping_transit_time_profile_id, delivery_weekday_iso, delivery_enabled) VALUES (v_p1, 0, true);
      v_fail := v_fail || 'T18 delivery weekday 0 accepted';
    EXCEPTION WHEN others THEN NULL; END;

    FOR d IN 1..7 LOOP
      INSERT INTO public.shipping_transit_delivery_weekdays
        (shipping_transit_time_profile_id, delivery_weekday_iso, delivery_enabled)
        VALUES (v_p1, d, d <= 5);
    END LOOP;

    BEGIN
      INSERT INTO public.shipping_transit_delivery_weekdays
        (shipping_transit_time_profile_id, delivery_weekday_iso, delivery_enabled) VALUES (v_p1, 3, true);
      v_fail := v_fail || 'T19 duplicate delivery weekday accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T20 activation without calendars rejected
    BEGIN
      UPDATE public.shipping_transit_time_profiles SET status = 'active' WHERE id = v_p1;
      SET CONSTRAINTS ALL IMMEDIATE;
      v_fail := v_fail || 'T20 activation without calendars accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T21 invalid IANA timezone rejected
    BEGIN
      INSERT INTO public.shipping_calendar_profiles
        (scope_type, company_id, merchant_store_id, calendar_code, version_number, calendar_type, country_code, timezone_name)
        VALUES ('merchant_store', v_co_a, v_st_a, 'neg-tz', 1, 'origin_handover', 'NL', 'Europe/Atlantis');
      v_fail := v_fail || 'T21 invalid IANA timezone accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T22 invalid calendar type rejected
    BEGIN
      INSERT INTO public.shipping_calendar_profiles
        (scope_type, company_id, merchant_store_id, calendar_code, version_number, calendar_type, country_code, timezone_name)
        VALUES ('merchant_store', v_co_a, v_st_a, 'neg-type', 1, 'generic', 'NL', 'Europe/Amsterdam');
      v_fail := v_fail || 'T22 invalid calendar type accepted';
    EXCEPTION WHEN others THEN NULL; END;

    INSERT INTO public.shipping_calendar_profiles
      (id, scope_type, company_id, merchant_store_id, calendar_code, version_number, calendar_type, country_code, timezone_name)
      VALUES (v_cal_o, 'merchant_store', v_co_a, v_st_a, 'nl-warehouse', 1, 'origin_handover', 'NL', 'Europe/Amsterdam'),
             (v_cal_c, 'merchant_store', v_co_a, v_st_a, 'postnl-transit', 1, 'carrier_transit', NULL, 'Europe/Amsterdam'),
             (v_cal_d, 'merchant_store', v_co_a, v_st_a, 'se-delivery', 1, 'destination_delivery', 'SE', 'Europe/Stockholm');
    INSERT INTO public.shipping_calendar_profiles
      (id, scope_type, company_id, merchant_store_id, calendar_code, version_number, calendar_type, country_code, timezone_name, status)
      VALUES (v_cal_x, 'merchant_store', v_co_b, v_st_b, 'be-warehouse', 1, 'origin_handover', 'NL', 'Europe/Brussels', 'active');

    -- T23 duplicate calendar version rejected
    BEGIN
      INSERT INTO public.shipping_calendar_profiles
        (scope_type, company_id, merchant_store_id, calendar_code, version_number, calendar_type, country_code, timezone_name)
        VALUES ('merchant_store', v_co_a, v_st_a, 'nl-warehouse', 1, 'origin_handover', 'NL', 'Europe/Amsterdam');
      v_fail := v_fail || 'T23 duplicate calendar version accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T24 blackout duplicate date rejected / T25 invalid reason rejected
    INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id, blackout_date, reason_code)
      VALUES (v_cal_o, DATE '2027-12-25', 'public_holiday');
    BEGIN
      INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id, blackout_date, reason_code)
        VALUES (v_cal_o, DATE '2027-12-25', 'warehouse_closed');
      v_fail := v_fail || 'T24 duplicate blackout date accepted';
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN
      INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id, blackout_date, reason_code)
        VALUES (v_cal_o, DATE '2027-12-26', 'snow');
      v_fail := v_fail || 'T25 invalid blackout reason accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T26 calendar role/type mismatch rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profile_calendars
        (shipping_transit_time_profile_id, shipping_calendar_profile_id, calendar_role)
        VALUES (v_p1, v_cal_o, 'carrier_transit');
      v_fail := v_fail || 'T26 calendar role/type mismatch accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T27 cross-tenant calendar assignment rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profile_calendars
        (shipping_transit_time_profile_id, shipping_calendar_profile_id, calendar_role)
        VALUES (v_p1, v_cal_x, 'origin_handover');
      v_fail := v_fail || 'T27 cross-tenant calendar assignment accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T28 destination calendar country mismatch rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profile_calendars
        (shipping_transit_time_profile_id, shipping_calendar_profile_id, calendar_role)
        VALUES (v_p1, v_cal_o, 'destination_delivery');
      v_fail := v_fail || 'T28 destination calendar country mismatch accepted';
    EXCEPTION WHEN others THEN NULL; END;

    INSERT INTO public.shipping_transit_time_profile_calendars
      (shipping_transit_time_profile_id, shipping_calendar_profile_id, calendar_role)
      VALUES (v_p1, v_cal_o, 'origin_handover'),
             (v_p1, v_cal_c, 'carrier_transit'),
             (v_p1, v_cal_d, 'destination_delivery');

    -- T29 duplicate role assignment rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profile_calendars
        (shipping_transit_time_profile_id, shipping_calendar_profile_id, calendar_role)
        VALUES (v_p1, v_cal_o, 'origin_handover');
      v_fail := v_fail || 'T29 duplicate calendar role accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T30 activation with draft calendars rejected
    BEGIN
      UPDATE public.shipping_transit_time_profiles SET status = 'active' WHERE id = v_p1;
      SET CONSTRAINTS ALL IMMEDIATE;
      v_fail := v_fail || 'T30 activation with non-active calendars accepted';
    EXCEPTION WHEN others THEN NULL; END;

    UPDATE public.shipping_calendar_profiles SET status = 'active' WHERE id IN (v_cal_o, v_cal_c, v_cal_d);

    -- T31 blackout immutability after calendar activation
    BEGIN
      INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id, blackout_date, reason_code)
        VALUES (v_cal_o, DATE '2027-12-27', 'warehouse_closed');
      v_fail := v_fail || 'T31 blackout insert on active calendar accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T32 active calendar immutable
    BEGIN
      UPDATE public.shipping_calendar_profiles SET timezone_name = 'Europe/Berlin' WHERE id = v_cal_o;
      v_fail := v_fail || 'T32 active calendar timezone change accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T33 activation succeeds
    UPDATE public.shipping_transit_time_profiles SET status = 'active' WHERE id = v_p1;
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT count(*) INTO v_n FROM public.shipping_transit_time_profiles WHERE id = v_p1 AND status = 'active';
    IF v_n <> 1 THEN v_fail := v_fail || 'T33 valid activation failed'; END IF;

    -- T34 active transit profile immutable
    BEGIN
      UPDATE public.shipping_transit_time_profiles SET carrier_code = 'DHL' WHERE id = v_p1;
      v_fail := v_fail || 'T34 active transit profile carrier change accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T35 children immutable after activation
    BEGIN
      UPDATE public.shipping_transit_time_weekday_rules SET transit_max_business_days = 9
        WHERE shipping_transit_time_profile_id = v_p1 AND handover_weekday_iso = 1;
      v_fail := v_fail || 'T35 weekday rule change on active profile accepted';
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN
      UPDATE public.shipping_transit_delivery_weekdays SET delivery_enabled = true
        WHERE shipping_transit_time_profile_id = v_p1 AND delivery_weekday_iso = 7;
      v_fail := v_fail || 'T36 delivery weekday change on active profile accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T37 second active version in the same family rejected
    BEGIN
      INSERT INTO public.shipping_transit_time_profiles
        (id, scope_type, company_id, merchant_store_id, profile_code, version_number, carrier_code, service_code,
         origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code, status, supersedes_profile_id)
        VALUES (v_p2, 'merchant_store', v_co_a, v_st_a, 'nl-se-standard', 2, 'POSTNL', 'STD', 'exact_origin', v_or_a, 'NL', 'SE', 'active', v_p1);
      SET CONSTRAINTS ALL IMMEDIATE;
      v_fail := v_fail || 'T37 second active version accepted';
    EXCEPTION WHEN others THEN NULL; END;

    -- T38..T42 security posture
    SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relforcerowsecurity
        AND c.relname IN ('shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
                          'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
                          'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars');
    IF v_n <> 6 THEN v_fail := v_fail || format('T38 RLS force expected 6 got %s', v_n); END IF;

    SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public'
      AND tablename IN ('shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
                        'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
                        'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars');
    IF v_n <> 0 THEN v_fail := v_fail || 'T39 policies present'; END IF;

    SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL (VALUES ('anon'),('authenticated'),('service_role')) rl(r),
      LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) pv(p)
      WHERE n.nspname = 'public'
        AND c.relname IN ('shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
                          'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
                          'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars')
        AND has_table_privilege(rl.r, c.oid, pv.p);
    IF v_n <> 0 THEN v_fail := v_fail || 'T40 application grants present'; END IF;

    SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S'
        AND (c.relname LIKE 'shipping_transit%' OR c.relname LIKE 'shipping_calendar%');
    IF v_n <> 0 THEN v_fail := v_fail || 'T41 new sequences present'; END IF;

    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'm1c1dd_guard_%'
        AND (p.proacl IS NULL
          OR has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('service_role', p.oid, 'EXECUTE'));
    IF v_n <> 0 THEN v_fail := v_fail || 'T42 guard function ACL leak'; END IF;

    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'm1c1dd_guard_%';
    IF v_n <> 9 THEN v_fail := v_fail || format('T43 guard inventory expected 9 got %s', v_n); END IF;

    -- T44 R-C2 unchanged
    SELECT count(*) INTO v_n FROM public.channel_connections
      WHERE mode = 'live' AND live_authorized_at IS NOT NULL;
    IF v_n <> 0 THEN v_fail := v_fail || 'T44 live-authorized channel connection found'; END IF;

    -- T45 place_order fail-closed
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
      LATERAL (VALUES ('anon'),('authenticated'),('service_role')) rl(r)
      WHERE n.nspname = 'public' AND p.proname = 'place_order'
        AND has_function_privilege(rl.r, p.oid, 'EXECUTE');
    IF v_n <> 0 THEN v_fail := v_fail || 'T45 place_order executable'; END IF;

    IF array_length(v_fail, 1) IS NULL THEN
      RAISE EXCEPTION 'M1C1DD_TESTS_PASSED';
    ELSE
      RAISE EXCEPTION 'M1C1DD_TESTS_FAILED: %', array_to_string(v_fail, ' | ');
    END IF;

  EXCEPTION WHEN others THEN
    IF SQLERRM = 'M1C1DD_TESTS_PASSED' THEN
      RAISE NOTICE 'M1C-1D-D harness: all assertions passed; fixtures rolled back';
    ELSE
      RAISE;
    END IF;
  END;
END
$harness$;