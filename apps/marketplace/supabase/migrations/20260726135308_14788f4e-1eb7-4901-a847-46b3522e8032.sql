DO $harness$
DECLARE
  fails text[] := '{}';
  passes int := 0;
  c1 uuid; c2 uuid;
  s1 uuid; s2 uuid;
  o1 uuid; o2 uuid;   -- o1: store1 NL, o2: store2 DE
  card_p uuid; card_m uuid; card_x uuid;
  lane_a uuid; lane_b uuid;
  n bigint;
BEGIN
  SELECT id INTO c1 FROM public.companies ORDER BY created_at LIMIT 1;
  SELECT id INTO c2 FROM public.companies WHERE id <> c1 ORDER BY created_at LIMIT 1;
  IF c1 IS NULL OR c2 IS NULL THEN RAISE EXCEPTION 'M1C-1C harness: need two companies'; END IF;

  INSERT INTO public.merchant_stores (company_id, slug, display_name, country_code)
    VALUES (c1, 'm1c1c-harness-a', 'Harness A', 'NL') RETURNING id INTO s1;
  INSERT INTO public.merchant_stores (company_id, slug, display_name, country_code)
    VALUES (c2, 'm1c1c-harness-b', 'Harness B', 'DE') RETURNING id INTO s2;

  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
    VALUES (c1, s1, 'store', 'NL origin', 'NL', 'active') RETURNING id INTO o1;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
    VALUES (c2, s2, 'store', 'DE origin', 'DE', 'draft') RETURNING id INTO o2;

  ---------------------------------------------------------------- T01
  BEGIN
    INSERT INTO public.shipping_rate_cards (scope_type, company_id, merchant_store_id, carrier_code, service_code, currency_code)
      VALUES ('platform', c1, s1, 'POSTNL', 'PARCEL_EU', 'EUR');
    fails := fails || 'T01 platform scope accepted company/store';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T02
  BEGIN
    INSERT INTO public.shipping_rate_cards (scope_type, company_id, carrier_code, service_code, currency_code)
      VALUES ('merchant_store', c1, 'POSTNL', 'PARCEL_EU', 'EUR');
    fails := fails || 'T02 merchant scope accepted without store';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T03 cross-company
  BEGIN
    INSERT INTO public.shipping_rate_cards (scope_type, company_id, merchant_store_id, carrier_code, service_code, currency_code)
      VALUES ('merchant_store', c1, s2, 'POSTNL', 'PARCEL_EU', 'EUR');
    fails := fails || 'T03 cross-company rate card accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T04 invalid currency
  BEGIN
    INSERT INTO public.shipping_rate_cards (scope_type, carrier_code, service_code, currency_code)
      VALUES ('platform', 'POSTNL', 'PARCEL_EU', 'eur');
    fails := fails || 'T04 invalid currency accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- valid cards
  BEGIN
    INSERT INTO public.shipping_rate_cards (scope_type, carrier_code, service_code, currency_code, volumetric_divisor)
      VALUES ('platform', 'DHL', 'PARCEL_EU', 'EUR', 5000) RETURNING id INTO card_p;
    INSERT INTO public.shipping_rate_cards (scope_type, company_id, merchant_store_id, carrier_code, service_code, currency_code)
      VALUES ('merchant_store', c1, s1, 'POSTNL', 'PARCEL_EU', 'EUR') RETURNING id INTO card_m;
    INSERT INTO public.shipping_rate_cards (scope_type, company_id, merchant_store_id, carrier_code, service_code, currency_code)
      VALUES ('merchant_store', c2, s2, 'DHL', 'PARCEL_EU', 'EUR') RETURNING id INTO card_x;
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T05 valid card creation failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T06 foreign-store exact origin
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
      origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
      VALUES (card_m, c1, s1, 'exact_origin', o2, 'DE', 'SE');
    fails := fails || 'T06 exact origin from another store accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T07 origin-country mismatch
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
      origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
      VALUES (card_m, c1, s1, 'exact_origin', o1, 'BE', 'SE');
    fails := fails || 'T07 origin country mismatch accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T08 tenancy denorm mismatch
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
      origin_scope_type, origin_country_code, destination_country_code)
      VALUES (card_m, c2, s2, 'origin_country', 'NL', 'SE');
    fails := fails || 'T08 lane tenancy mismatch accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T09 invalid country code
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, origin_scope_type, origin_country_code, destination_country_code)
      VALUES (card_p, 'origin_country', 'NL', 'SWE');
    fails := fails || 'T09 invalid destination country accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T10 origin_country lane with origin id
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
      origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
      VALUES (card_m, c1, s1, 'origin_country', o1, 'NL', 'SE');
    fails := fails || 'T10 origin_country lane accepted an exact origin id';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T11 SE destination, no local market
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
      origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
      VALUES (card_m, c1, s1, 'exact_origin', o1, 'NL', 'SE') RETURNING id INTO lane_a;
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, origin_scope_type, origin_country_code, destination_country_code)
      VALUES (card_p, 'origin_country', 'DE', 'SE') RETURNING id INTO lane_b;
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T11 SE lane creation failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T12 negative charge
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'standard', 0, 1000, -1);
    fails := fails || 'T12 negative charge accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T13 invalid free threshold
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor,
      free_above_merchandise_amount_minor)
      VALUES (lane_a, 'standard', 0, 1000, 495, 0);
    fails := fails || 'T13 zero free threshold accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T14 invalid weight range
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'standard', 1000, 1000, 495);
    fails := fails || 'T14 non-increasing weight range accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T15 invalid parcel range
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, parcel_count_from, parcel_count_to,
      customer_charge_amount_minor)
      VALUES (lane_a, 'standard', 0, 1000, 0, 2, 495);
    fails := fails || 'T15 parcel_count_from 0 accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T16 pickup_only
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'pickup_only', 0, 1000, 0);
    fails := fails || 'T16 pickup_only automatic parcel rate accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T17 valid tiers + free shipping
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor,
      free_above_merchandise_amount_minor)
      VALUES (lane_a, 'standard', 0, 1000, 495, 5000);
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'standard', 1001, 10000, 995);
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'standard', 10001, 30000, 0);  -- free shipping to customer
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T17 valid tier insert failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T18 overlap rejected
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'standard', 500, 2000, 795);
    fails := fails || 'T18 overlapping weight/parcel rule accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T19 overlap only by dimensions rejected
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor, max_length_mm)
      VALUES (lane_a, 'standard', 0, 1000, 595, 400);
    fails := fails || 'T19 dimension-only differentiated overlapping rule accepted';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T20 different handling class may share range
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'oversized', 0, 1000, 1995);
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_a, 'pallet', 0, 1000, 8995);
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T20 handling-class separation failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T21 same range other lane accepted
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, customer_charge_amount_minor)
      VALUES (lane_b, 'standard', 0, 1000, 695);
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T21 same range in other lane failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T22 non-overlapping parcel counts accepted
  BEGIN
    INSERT INTO public.shipping_rate_rules (shipping_rate_lane_id, handling_class,
      billable_weight_from_grams, billable_weight_to_grams, parcel_count_from, parcel_count_to,
      customer_charge_amount_minor)
      VALUES (lane_b, 'standard', 0, 1000, 2, 4, 1295);
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T22 parcel-count separation failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T23 activation blocked on non-active origin
  BEGIN
    UPDATE public.merchant_fulfillment_origins SET status = 'inactive' WHERE id = o1;
    BEGIN
      UPDATE public.shipping_rate_cards SET status = 'active' WHERE id = card_m;
      fails := fails || 'T23 card activated with non-active exact origin';
    EXCEPTION WHEN others THEN passes := passes + 1; END;
    UPDATE public.merchant_fulfillment_origins SET status = 'active' WHERE id = o1;
  EXCEPTION WHEN others THEN fails := fails || ('T23 harness error: ' || SQLERRM); END;

  ---------------------------------------------------------------- T24 activation succeeds on active origin
  BEGIN
    UPDATE public.shipping_rate_cards SET status = 'active' WHERE id = card_m;
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T24 activation failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T25 active card immutable
  BEGIN
    UPDATE public.shipping_rate_cards SET currency_code = 'SEK' WHERE id = card_m;
    fails := fails || 'T25 active card currency mutated';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T26 active lanes immutable
  BEGIN
    UPDATE public.shipping_rate_lanes SET destination_country_code = 'DK' WHERE id = lane_a;
    fails := fails || 'T26 active card lane mutated';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T27 active rules immutable
  BEGIN
    UPDATE public.shipping_rate_rules SET customer_charge_amount_minor = 1
      WHERE shipping_rate_lane_id = lane_a;
    fails := fails || 'T27 active card rule mutated';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T28 no new lane on active card
  BEGIN
    INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
      origin_scope_type, origin_country_code, destination_country_code)
      VALUES (card_m, c1, s1, 'origin_country', 'NL', 'DK');
    fails := fails || 'T28 lane added to active card';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T29 origin retire blocked by active card
  BEGIN
    UPDATE public.merchant_fulfillment_origins SET status = 'retired' WHERE id = o1;
    fails := fails || 'T29 origin retired while active rate card depends on it';
  EXCEPTION WHEN others THEN passes := passes + 1; END;

  ---------------------------------------------------------------- T30 supersession needs a new card
  BEGIN
    INSERT INTO public.shipping_rate_cards (scope_type, company_id, merchant_store_id, carrier_code, service_code, currency_code, supersedes_card_id)
      VALUES ('merchant_store', c1, s1, 'POSTNL', 'PARCEL_EU', 'EUR', card_m);
    passes := passes + 1;
  EXCEPTION WHEN others THEN fails := fails || ('T30 supersession card failed: ' || SQLERRM); END;

  ---------------------------------------------------------------- T31 retired origin cannot back a new lane
  BEGIN
    UPDATE public.shipping_rate_cards SET status = 'inactive' WHERE id = card_m;
    UPDATE public.merchant_fulfillment_origins SET status = 'retired' WHERE id = o1;
    BEGIN
      INSERT INTO public.shipping_rate_lanes (shipping_rate_card_id, card_company_id, card_merchant_store_id,
        origin_scope_type, fulfillment_origin_id, origin_country_code, destination_country_code)
        VALUES (card_x, c2, s2, 'exact_origin', o1, 'NL', 'SE');
      fails := fails || 'T31 retired origin accepted on new lane';
    EXCEPTION WHEN others THEN passes := passes + 1; END;
  EXCEPTION WHEN others THEN fails := fails || ('T31 harness error: ' || SQLERRM); END;

  ---------------------------------------------------------------- cleanup (rollback of fixtures)
  UPDATE public.shipping_rate_cards SET status = 'draft';
  DELETE FROM public.shipping_rate_rules;
  DELETE FROM public.shipping_rate_lanes;
  UPDATE public.shipping_rate_cards SET supersedes_card_id = NULL;
  DELETE FROM public.shipping_rate_cards;
  DELETE FROM public.merchant_fulfillment_origins WHERE id IN (o1, o2);
  DELETE FROM public.merchant_stores WHERE id IN (s1, s2);

  ---------------------------------------------------------------- zero-delta assertions
  SELECT count(*) INTO n FROM public.shipping_rate_cards;
  IF n <> 0 THEN fails := fails || 'ZD cards not zero'; END IF;
  SELECT count(*) INTO n FROM public.shipping_rate_lanes;
  IF n <> 0 THEN fails := fails || 'ZD lanes not zero'; END IF;
  SELECT count(*) INTO n FROM public.shipping_rate_rules;
  IF n <> 0 THEN fails := fails || 'ZD rules not zero'; END IF;
  SELECT count(*) INTO n FROM public.merchant_fulfillment_origins;
  IF n <> 0 THEN fails := fails || 'ZD origins not zero'; END IF;
  SELECT count(*) INTO n FROM public.merchant_stores;
  IF n <> 0 THEN fails := fails || 'ZD stores not zero'; END IF;
  SELECT count(*) INTO n FROM public.merchant_store_sku_shipping_profiles;
  IF n <> 0 THEN fails := fails || 'ZD shipping profiles not zero'; END IF;
  SELECT count(*) INTO n FROM public.merchant_store_offer_prices;
  IF n <> 0 THEN fails := fails || 'ZD offer prices not zero'; END IF;
  SELECT count(*) INTO n FROM public.borvat_direct_listing_publications;
  IF n <> 0 THEN fails := fails || 'ZD publications not zero'; END IF;
  SELECT count(*) INTO n FROM public.tax_categories;
  IF n <> 4 THEN fails := fails || 'ZD tax_categories <> 4'; END IF;
  SELECT count(*) INTO n FROM public.tax_rate_bands;
  IF n <> 9 THEN fails := fails || 'ZD tax_rate_bands <> 9'; END IF;
  SELECT count(*) INTO n FROM public.tax_rate_versions;
  IF n <> 5 THEN fails := fails || 'ZD tax_rate_versions <> 5'; END IF;

  IF array_length(fails, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'M1C-1C HARNESS FAILED (% passed): %', passes, array_to_string(fails, ' | ');
  END IF;

  RAISE NOTICE 'M1C-1C HARNESS PASSED: % assertions', passes;
END
$harness$;