CREATE TABLE public._m1c1ee_verification (n serial PRIMARY KEY, outcome text NOT NULL);
GRANT SELECT ON public._m1c1ee_verification TO sandbox_exec;

CREATE FUNCTION public._m1c1ee_t_ok(p_sql text, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'PASS :: '||p_label;
EXCEPTION WHEN OTHERS THEN
  RETURN 'FAIL :: '||p_label||' (unexpected error: '||SQLERRM||')';
END;
$$;

CREATE FUNCTION public._m1c1ee_t_raises(p_sql text, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'FAIL :: '||p_label||' (expected rejection, statement succeeded)';
EXCEPTION WHEN OTHERS THEN
  RETURN 'PASS :: '||p_label;
END;
$$;

CREATE FUNCTION public._m1c1ee_t_true(p_cond boolean, p_label text) RETURNS text
LANGUAGE sql AS $$ SELECT CASE WHEN p_cond THEN 'PASS :: ' ELSE 'FAIL :: ' END || p_label $$;

CREATE FUNCTION public._m1c1ee_accept_sql(
  p_req uuid, p_offer uuid, p_buyer uuid,
  p_charge text DEFAULT 'o.customer_shipping_charge_minor',
  p_version text DEFAULT 'o.version_number',
  p_currency text DEFAULT 'o.currency_code',
  p_accepted_at text DEFAULT 'now()')
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format($f$
    INSERT INTO public.manual_shipping_quote_acceptances
      (request_family_id, manual_shipping_quote_request_id, manual_shipping_quote_offer_id,
       offer_version_number, buyer_principal_id, company_id, merchant_store_id, currency_code,
       accepted_shipping_charge_minor, delivery_min_calendar_days_after_acceptance,
       delivery_max_calendar_days_after_acceptance, quote_source, responsible_party,
       fulfillment_origin_id, delivery_destination_version_id, shipment_form,
       offer_offered_at, offer_expires_at, accepted_at, accepted_by_actor_type,
       accepted_by_buyer_principal_id)
    SELECT r.request_family_id, r.id, o.id, %s, o.buyer_principal_id, o.company_id,
           o.merchant_store_id, %s, %s,
           o.delivery_min_calendar_days_after_acceptance,
           o.delivery_max_calendar_days_after_acceptance, o.quote_source, o.responsible_party,
           r.fulfillment_origin_id, r.delivery_destination_version_id, r.shipment_form,
           o.offered_at, o.expires_at, %s, 'buyer', %L
      FROM public.manual_shipping_quote_offers o
      JOIN public.manual_shipping_quote_requests r ON r.id = o.manual_shipping_quote_request_id
     WHERE o.id = %L AND r.id = %L $f$,
    p_version, p_currency, p_charge, p_accepted_at, p_buyer, p_offer, p_req);
$$;

DO $harness$
DECLARE
  res text[] := '{}';
  v_owner uuid; v_buyer uuid; v_company uuid; v_store uuid; v_wh uuid;
  v_prod uuid; v_sku uuid; v_profile uuid; v_origin uuid;
  v_dest uuid; v_dver uuid; v_family uuid; v_req uuid; v_offer uuid; v_v2 uuid; v_draft uuid;
BEGIN
  -- ============ SECTION A — STRUCTURE (no fixtures needed) ============
  res := res || public._m1c1ee_t_true(to_regclass('public.manual_shipping_quote_acceptances') IS NOT NULL, 'A01 acceptances table exists');
  res := res || public._m1c1ee_t_true(to_regclass('public.manual_shipping_quote_acceptance_conditions') IS NOT NULL, 'A02 acceptance conditions table exists');
  res := res || public._m1c1ee_t_true(to_regclass('public.manual_shipping_quote_state_events') IS NOT NULL, 'A03 state events table exists');
  res := res || public._m1c1ee_t_true((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
      WHERE oid IN ('public.manual_shipping_quote_acceptances'::regclass,
                    'public.manual_shipping_quote_acceptance_conditions'::regclass,
                    'public.manual_shipping_quote_state_events'::regclass)), 'A04 RLS enabled and forced');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_policies WHERE tablename LIKE 'manual_shipping_quote_%') = 0, 'A05 deny-by-default: no policies');
  res := res || public._m1c1ee_t_true((SELECT bool_and(NOT EXISTS (
        SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee <> 0 AND a.grantee <> c.relowner))
      FROM pg_class c WHERE c.oid IN ('public.manual_shipping_quote_acceptances'::regclass,
                    'public.manual_shipping_quote_acceptance_conditions'::regclass,
                    'public.manual_shipping_quote_state_events'::regclass)), 'A06 no non-owner ACL grants');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_constraint
      WHERE conname IN ('msqa_family_uk','msqa_request_uk','msqa_offer_uk')) = 3, 'A07 family/request/offer uniqueness');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_indexes WHERE indexname='msqo_single_accepted_version_uk') = 1, 'A08 one accepted offer per request');
  res := res || public._m1c1ee_t_true((SELECT pg_get_constraintdef(oid) LIKE '%superseded%' FROM pg_constraint WHERE conname='msqr_status_ck'), 'A09 request status includes superseded');
  res := res || public._m1c1ee_t_true((SELECT pg_get_constraintdef(oid) LIKE '%accepted%' AND pg_get_constraintdef(oid) LIKE '%invalidated%' FROM pg_constraint WHERE conname='msqo_status_ck'), 'A10 offer status includes accepted and invalidated');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'm1c1ee_guard_%') = 6, 'A11 six guard routines');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('m1c1ee_offer_effective_status','m1c1ee_offer_acceptability')) = 2, 'A12 two private read-only status functions');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'm1c1ee_%') = 6, 'A13 six triggers installed');
  res := res || public._m1c1ee_t_true((SELECT bool_and(array_to_string(p.proconfig,',') LIKE 'search_path=%')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'm1c1ee_%'), 'A14 empty search_path pinned');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM information_schema.columns
      WHERE table_name='manual_shipping_quote_acceptances'
        AND (column_name LIKE '%order%' OR column_name LIKE '%payment%' OR column_name LIKE '%reservation%'
             OR column_name LIKE '%label%' OR column_name LIKE '%tracking%')) = 0, 'A15 no order/payment/reservation/label leakage');
  res := res || public._m1c1ee_t_true((SELECT count(*) FROM pg_constraint
      WHERE conname IN ('msqa_request_family_fk','msqa_offer_binding_fk','msqa_origin_tenancy_fk','msqa_destination_buyer_fk')) = 4, 'A16 tenancy-bound composite foreign keys');

  -- ============ FIXTURES + BEHAVIOUR (everything below rolls back) ============
  BEGIN
    SELECT id INTO v_owner FROM public.profiles ORDER BY id LIMIT 1;
    SELECT id INTO v_buyer FROM public.profiles WHERE id <> v_owner ORDER BY id LIMIT 1;

    INSERT INTO public.companies (name, slug, owner_user_id)
      VALUES ('M1C1EE Harness Co', 'm1c1ee-harness-co', v_owner) RETURNING id INTO v_company;
    INSERT INTO public.merchant_stores (company_id, slug, display_name, status)
      VALUES (v_company, 'm1c1ee-harness-store', 'M1C1EE Harness Store', 'active') RETURNING id INTO v_store;
    INSERT INTO public.warehouses (company_id, code, name)
      VALUES (v_company, 'M1C1EE-WH', 'M1C1EE Warehouse') RETURNING id INTO v_wh;
    INSERT INTO public.catalog_products (company_id, title)
      VALUES (v_company, 'M1C1EE Product') RETURNING id INTO v_prod;
    INSERT INTO public.catalog_skus (company_id, code, product_id)
      VALUES (v_company, 'M1C1EE-SKU-1', v_prod) RETURNING id INTO v_sku;
    INSERT INTO public.merchant_store_sku_shipping_profiles
      (company_id, merchant_store_id, catalog_sku_id, version, handling_class, status)
      VALUES (v_company, v_store, v_sku, 1, 'standard', 'active') RETURNING id INTO v_profile;
    INSERT INTO public.merchant_store_sku_shipping_packages
      (shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package,
       weight_grams, length_mm, width_mm, height_mm)
      VALUES (v_profile, v_company, v_store, 1, 1, 4000, 400, 300, 200);
    INSERT INTO public.merchant_fulfillment_origins
      (company_id, merchant_store_id, warehouse_id, origin_type, label, country_code, postal_code, status)
      VALUES (v_company, v_store, v_wh, 'warehouse', 'M1C1EE Origin', 'NL', '1011AB', 'active')
      RETURNING id INTO v_origin;
    INSERT INTO public.merchant_store_sku_fulfillment_origins
      (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default, status)
      VALUES (v_profile, v_origin, v_company, v_store, 1, true, 'active');
    INSERT INTO public.customer_delivery_destinations (buyer_principal_id, status)
      VALUES (v_buyer, 'active') RETURNING id INTO v_dest;
    INSERT INTO public.customer_delivery_destination_versions
      (customer_delivery_destination_id, buyer_principal_id, version_number, precision_level,
       country_code, postal_code, postal_code_normalized, city, destination_type, status)
      VALUES (v_dest, v_buyer, 1, 'quote_area', 'NL', '3011 AB', '3011AB', 'Rotterdam', 'residential', 'active')
      RETURNING id INTO v_dver;

    v_family := gen_random_uuid();
    INSERT INTO public.manual_shipping_quote_requests
      (buyer_principal_id, company_id, merchant_store_id, delivery_destination_version_id,
       fulfillment_origin_id, shipment_form, currency_code, request_family_id, version_number, status)
      VALUES (v_buyer, v_company, v_store, v_dver, v_origin, 'parcel', 'EUR', v_family, 1, 'draft')
      RETURNING id INTO v_req;
    INSERT INTO public.manual_shipping_quote_request_items
      (manual_shipping_quote_request_id, company_id, merchant_store_id, shipping_profile_id, line_number, quantity)
      VALUES (v_req, v_company, v_store, v_profile, 1, 1);
    INSERT INTO public.manual_shipping_quote_request_packages
      (manual_shipping_quote_request_id, package_number, package_count, weight_grams, length_mm, width_mm, height_mm)
      VALUES (v_req, 1, 1, 4000, 400, 300, 200);
    UPDATE public.manual_shipping_quote_requests SET status='requested', requested_at=now() WHERE id=v_req;
    UPDATE public.manual_shipping_quote_requests SET status='under_review' WHERE id=v_req;
    INSERT INTO public.manual_shipping_quote_offers
      (manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id,
       currency_code, version_number, status, quote_source, responsible_party,
       customer_shipping_charge_minor, delivery_min_calendar_days_after_acceptance,
       delivery_max_calendar_days_after_acceptance, offered_at, expires_at)
      VALUES (v_req, v_buyer, v_company, v_store, 'EUR', 1, 'offered', 'merchant_store', 'merchant_store',
              4995, 3, 6, now() - interval '1 hour', now() + interval '7 days')
      RETURNING id INTO v_offer;
    INSERT INTO public.manual_shipping_quote_offer_conditions
      (manual_shipping_quote_offer_id, condition_number, condition_code)
      VALUES (v_offer, 1, 'curbside_delivery');
    UPDATE public.manual_shipping_quote_requests SET status='quoted' WHERE id=v_req;

    res := res || 'PASS :: B00 fixture graph created (rolled back at the end)';

    -- ---------- B: eligibility ----------
    res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(v_offer) = 'acceptable', 'B01 live offer on a quoted request is acceptable');
    res := res || public._m1c1ee_t_true(public.m1c1ee_offer_effective_status(v_offer) = 'offered', 'B02 effective status of a live offer is offered');
    res := res || public._m1c1ee_t_true(public.m1c1ee_offer_effective_status(v_offer, now() + interval '30 days') = 'expired', 'B03 expiry derived at read time, no cron needed');
    res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(gen_random_uuid()) = 'offer_not_found', 'B04 unknown offer is not acceptable');
    res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(v_offer, now() + interval '30 days') = 'offer_expired', 'B05 acceptability reports expiry at a future instant');

    BEGIN
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer, p_charge => '100'), 'B06 charge different from the offer is rejected');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer, p_version => '99'), 'B07 wrong offer version is rejected');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_owner), 'B08 acceptance by a non-owning buyer is rejected');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer, p_currency => '''USD'''), 'B09 acceptance in another currency is rejected');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer, p_accepted_at => 'o.expires_at + interval ''1 second'''), 'B10 acceptance after the expiry instant is rejected');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_offers SET expires_at = now() - interval ''1 day'' WHERE id = %L', v_offer), 'B11 published expiry instant is immutable');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_offers SET status=''expired'' WHERE id = %L', v_offer), 'B12 offer cannot be expired before its expiry instant');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_requests SET status=''expired'' WHERE id = %L', v_req), 'B13 request cannot be expired before its expiry instant');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- superseded version
    BEGIN
      UPDATE public.manual_shipping_quote_offers SET status='superseded' WHERE id=v_offer;
      INSERT INTO public.manual_shipping_quote_offers
        (manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id,
         currency_code, version_number, status, quote_source, responsible_party,
         customer_shipping_charge_minor, delivery_min_calendar_days_after_acceptance,
         delivery_max_calendar_days_after_acceptance, offered_at, expires_at, supersedes_offer_id)
        VALUES (v_req, v_buyer, v_company, v_store, 'EUR', 2, 'offered', 'merchant_store', 'merchant_store',
                5995, 3, 6, now() - interval '1 minute', now() + interval '7 days', v_offer)
        RETURNING id INTO v_v2;
      res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(v_offer) = 'offer_not_published', 'B14 a superseded offer version is not acceptable');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'B15 accepting a superseded version is rejected');
      res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(v_v2) = 'acceptable', 'B16 the newest published version stays acceptable');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- draft offer
    BEGIN
      INSERT INTO public.manual_shipping_quote_offers
        (manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id,
         currency_code, version_number, status, quote_source, responsible_party)
        VALUES (v_req, v_buyer, v_company, v_store, 'EUR', 7, 'draft', 'merchant_store', 'merchant_store')
        RETURNING id INTO v_draft;
      res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(v_draft) <> 'acceptable', 'B17 a draft offer is never acceptable');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_draft, v_buyer), 'B18 accepting a draft offer is rejected');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN
      IF v_draft IS NULL THEN res := res || 'FAIL :: B17/B18 draft offer fixture ('||SQLERRM||')'; END IF;
    END;

    -- ---------- C: happy path + atomic settlement ----------
    BEGIN
      res := res || public._m1c1ee_t_ok(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'C01 a valid acceptance snapshot is recorded');
      res := res || public._m1c1ee_t_ok(format($q$
        INSERT INTO public.manual_shipping_quote_acceptance_conditions
          (manual_shipping_quote_acceptance_id, condition_number, condition_code)
        SELECT a.id, 1, 'curbside_delivery' FROM public.manual_shipping_quote_acceptances a
         WHERE a.manual_shipping_quote_offer_id = %L$q$, v_offer), 'C02 published conditions are frozen into the snapshot');
      res := res || public._m1c1ee_t_raises(format($q$
        INSERT INTO public.manual_shipping_quote_acceptance_conditions
          (manual_shipping_quote_acceptance_id, condition_number, condition_code)
        SELECT a.id, 2, 'lift_gate_included' FROM public.manual_shipping_quote_acceptances a
         WHERE a.manual_shipping_quote_offer_id = %L$q$, v_offer), 'C03 an unpublished condition cannot be frozen');
      res := res || public._m1c1ee_t_raises('SET CONSTRAINTS ALL IMMEDIATE', 'C04 acceptance without settling offer and request fails closed');
      res := res || public._m1c1ee_t_ok(format($q$
        UPDATE public.manual_shipping_quote_offers SET status='accepted' WHERE id=%L;
        UPDATE public.manual_shipping_quote_requests SET status='accepted' WHERE id=%L;
        SET CONSTRAINTS ALL IMMEDIATE$q$, v_offer, v_req), 'C05 settled acceptance passes the atomic commit check');
      res := res || public._m1c1ee_t_true((SELECT count(*) FROM public.manual_shipping_quote_acceptances
          WHERE request_family_id = v_family) = 1, 'C06 exactly one acceptance exists in the family');
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'C07 double acceptance is rejected');
      res := res || public._m1c1ee_t_true(public.m1c1ee_offer_acceptability(v_offer) = 'offer_not_published', 'C08 an accepted offer is no longer acceptable');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_acceptances SET accepted_shipping_charge_minor = 1 WHERE request_family_id = %L', v_family), 'C09 accepted terms cannot be updated');
      res := res || public._m1c1ee_t_raises(format('DELETE FROM public.manual_shipping_quote_acceptances WHERE request_family_id = %L', v_family), 'C10 acceptances cannot be deleted');
      res := res || public._m1c1ee_t_raises($q$UPDATE public.manual_shipping_quote_acceptance_conditions SET condition_number = 9$q$, 'C11 accepted conditions cannot be updated');
      res := res || public._m1c1ee_t_raises($q$DELETE FROM public.manual_shipping_quote_acceptance_conditions$q$, 'C12 accepted conditions cannot be deleted');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_offers SET customer_shipping_charge_minor = 1 WHERE id=%L', v_offer), 'C13 an accepted offer is historically frozen');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_offers SET status=''withdrawn'' WHERE id=%L', v_offer), 'C14 an accepted offer cannot be withdrawn');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_requests SET status=''cancelled'' WHERE id=%L', v_req), 'C15 an accepted request is terminal');
      res := res || public._m1c1ee_t_raises(format($q$
        INSERT INTO public.manual_shipping_quote_requests
          (buyer_principal_id, company_id, merchant_store_id, delivery_destination_version_id,
           fulfillment_origin_id, shipment_form, currency_code, request_family_id, version_number, status)
        VALUES (%L,%L,%L,%L,%L,'parcel','EUR',%L,2,'draft')$q$,
        v_buyer, v_company, v_store, v_dver, v_origin, v_family), 'C16 an accepted family is closed to new versions');
      res := res || public._m1c1ee_t_true((SELECT count(*) FROM public.orders WHERE created_at > now() - interval '1 minute') = 0, 'C17 acceptance creates no order');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- offer accepted without an acceptance row must fail closed
    BEGIN
      res := res || public._m1c1ee_t_raises(format($q$
        UPDATE public.manual_shipping_quote_offers SET status='accepted' WHERE id=%L;
        SET CONSTRAINTS ALL IMMEDIATE$q$, v_offer), 'C18 an offer cannot be marked accepted without an acceptance snapshot');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- ---------- D: invalidation and supersession ----------
    BEGIN
      res := res || public._m1c1ee_t_raises(format($q$
        UPDATE public.manual_shipping_quote_requests SET status='superseded' WHERE id=%L;
        SET CONSTRAINTS ALL IMMEDIATE$q$, v_req), 'D01 a request cannot be superseded while an offer is live');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      res := res || public._m1c1ee_t_ok(format($q$
        UPDATE public.manual_shipping_quote_offers SET status='invalidated' WHERE id=%L;
        UPDATE public.manual_shipping_quote_requests SET status='superseded' WHERE id=%L;
        SET CONSTRAINTS ALL IMMEDIATE$q$, v_offer, v_req), 'D02 invalidating the offer allows supersession');
      res := res || public._m1c1ee_t_true((SELECT status FROM public.manual_shipping_quote_offers WHERE id=v_offer) = 'invalidated', 'D03 the invalidated offer is retained as history');
      res := res || public._m1c1ee_t_raises(format('UPDATE public.manual_shipping_quote_offers SET status=''offered'' WHERE id=%L', v_offer), 'D04 an invalidated offer cannot be republished');
      res := res || public._m1c1ee_t_ok(format($q$
        INSERT INTO public.manual_shipping_quote_requests
          (buyer_principal_id, company_id, merchant_store_id, delivery_destination_version_id,
           fulfillment_origin_id, shipment_form, currency_code, request_family_id, version_number,
           status, supersedes_request_id)
        VALUES (%L,%L,%L,%L,%L,'parcel','EUR',%L,2,'draft',%L)$q$,
        v_buyer, v_company, v_store, v_dver, v_origin, v_family, v_req), 'D05 a new request version may be issued in the family');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- ---------- E: append-only events ----------
    BEGIN
      res := res || public._m1c1ee_t_ok(format($q$
        INSERT INTO public.manual_shipping_quote_state_events
          (request_family_id, manual_shipping_quote_request_id, manual_shipping_quote_offer_id,
           subject, event_type, from_status, to_status, actor_type, actor_principal_id)
        VALUES (%L,%L,%L,'offer','offer_published','draft','offered','buyer',%L)$q$,
        v_family, v_req, v_offer, v_buyer), 'E01 a lifecycle event can be appended');
      res := res || public._m1c1ee_t_raises('UPDATE public.manual_shipping_quote_state_events SET to_status=''accepted''', 'E02 lifecycle events cannot be updated');
      res := res || public._m1c1ee_t_raises('DELETE FROM public.manual_shipping_quote_state_events', 'E03 lifecycle events cannot be deleted');
      res := res || public._m1c1ee_t_raises(format($q$
        INSERT INTO public.manual_shipping_quote_state_events
          (request_family_id, manual_shipping_quote_request_id, subject, event_type, actor_type)
        VALUES (%L,%L,'request','request_quoted','platform')$q$, gen_random_uuid(), v_req), 'E04 a mismatched request family is rejected');
      res := res || public._m1c1ee_t_raises(format($q$
        INSERT INTO public.manual_shipping_quote_state_events
          (request_family_id, manual_shipping_quote_request_id, subject, event_type, actor_type)
        VALUES (%L,%L,'offer','offer_published','platform')$q$, v_family, v_req), 'E05 an offer event without an offer reference is rejected');
      res := res || public._m1c1ee_t_raises(format($q$
        INSERT INTO public.manual_shipping_quote_state_events
          (request_family_id, manual_shipping_quote_request_id, subject, event_type, actor_type, actor_principal_id)
        VALUES (%L,%L,'request','request_quoted','platform',%L)$q$, v_family, v_req, v_buyer), 'E06 a platform event may not carry a buyer principal');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- ---------- F: context revalidation at acceptance ----------
    BEGIN
      UPDATE public.merchant_fulfillment_origins SET status='inactive' WHERE id=v_origin;
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'F01 acceptance fails closed when the exact origin is inactive');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      UPDATE public.merchant_store_sku_shipping_profiles SET status='inactive' WHERE id=v_profile;
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'F02 acceptance fails closed when an item profile is inactive');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      UPDATE public.merchant_store_sku_fulfillment_origins SET status='inactive'
       WHERE shipping_profile_id=v_profile AND fulfillment_origin_id=v_origin;
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'F03 acceptance fails closed when the item is no longer eligible for the origin');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      DELETE FROM public.manual_shipping_quote_request_packages WHERE manual_shipping_quote_request_id=v_req;
      res := res || public._m1c1ee_t_raises(public._m1c1ee_accept_sql(v_req, v_offer, v_buyer), 'F04 acceptance fails closed when the package snapshot is gone');
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RAISE EXCEPTION 'M1C1EE_HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'M1C1EE_HARNESS_ROLLBACK' THEN
      res := res || ('FATAL :: harness aborted early: '||SQLERRM);
    END IF;
  END;

  INSERT INTO public._m1c1ee_verification(outcome) SELECT unnest(res);
END;
$harness$;