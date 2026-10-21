DO $h$
DECLARE
  n int := 0; f int := 0; lg text := '';
  r record;
  cA uuid; cB uuid; skuA uuid;
  sA uuid := gen_random_uuid(); sB uuid := gen_random_uuid();
  spA uuid := gen_random_uuid();
  oA1 uuid := gen_random_uuid(); oDE uuid := gen_random_uuid();
  ppA uuid := gen_random_uuid();
  asgA uuid := gen_random_uuid(); asgDE uuid := gen_random_uuid();
  cardA uuid := gen_random_uuid(); cardBE uuid := gen_random_uuid();
  cardSE uuid := gen_random_uuid(); cardDESE uuid := gen_random_uuid(); cardX uuid := gen_random_uuid();
  laneA uuid := gen_random_uuid(); laneBE uuid := gen_random_uuid();
  laneSE uuid := gen_random_uuid(); laneDESE uuid := gen_random_uuid(); laneX uuid := gen_random_uuid();
  tpA uuid := gen_random_uuid(); tpBE uuid := gen_random_uuid();
  tpSE uuid := gen_random_uuid(); tpDESE uuid := gen_random_uuid(); tpX uuid := gen_random_uuid();
  calO uuid := gen_random_uuid(); calC uuid := gen_random_uuid(); calD uuid := gen_random_uuid();
  bindA uuid := gen_random_uuid(); bindBE uuid := gen_random_uuid();
  bindSE uuid := gen_random_uuid(); bindDESE uuid := gen_random_uuid(); bindX uuid := gen_random_uuid();
  pkg1 uuid := gen_random_uuid(); pkg2 uuid := gen_random_uuid();
  ob bigint; ab bigint; ce bigint;
BEGIN
  BEGIN
    ALTER TABLE public.merchant_stores DISABLE TRIGGER USER;
    ALTER TABLE public.merchant_fulfillment_origins DISABLE TRIGGER USER;
    ALTER TABLE public.merchant_store_sku_shipping_profiles DISABLE TRIGGER USER;
    ALTER TABLE public.merchant_store_sku_fulfillment_origins DISABLE TRIGGER USER;
    ALTER TABLE public.merchant_store_sku_shipping_packages DISABLE TRIGGER USER;
    ALTER TABLE public.delivery_promise_profiles DISABLE TRIGGER USER;
    ALTER TABLE public.delivery_promise_weekly_schedules DISABLE TRIGGER USER;
    ALTER TABLE public.merchant_store_sku_delivery_promise_assignments DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_rate_cards DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_rate_lanes DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_transit_time_profiles DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_transit_time_weekday_rules DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_transit_delivery_weekdays DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_calendar_profiles DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_calendar_blackout_dates DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_transit_time_profile_calendars DISABLE TRIGGER USER;
    ALTER TABLE public.shipping_rate_lane_transit_profile_bindings DISABLE TRIGGER USER;
    DROP INDEX public.srltpb_one_active_per_lane_uk;

    SELECT company_id INTO cA FROM public.catalog_skus GROUP BY company_id ORDER BY company_id LIMIT 1;
    SELECT company_id INTO cB FROM public.catalog_skus WHERE company_id <> cA GROUP BY company_id ORDER BY company_id LIMIT 1;
    SELECT id INTO skuA FROM public.catalog_skus WHERE company_id = cA ORDER BY id LIMIT 1;

    INSERT INTO public.merchant_stores (id,company_id,slug,display_name,status)
      VALUES (sA,cA,'m1c1dg-a','M1C1DG A','active'), (sB,cB,'m1c1dg-b','M1C1DG B','active');

    INSERT INTO public.merchant_store_sku_shipping_profiles
      (id,company_id,merchant_store_id,catalog_sku_id,version,handling_class,status)
      VALUES (spA,cA,sA,skuA,1,'standard','active');
    INSERT INTO public.merchant_store_sku_shipping_packages
      (id,shipping_profile_id,company_id,merchant_store_id,package_number,quantity_per_package,weight_grams,length_mm,width_mm,height_mm)
      VALUES (pkg1,spA,cA,sA,1,1,1000,300,200,100);

    INSERT INTO public.merchant_fulfillment_origins
      (id,company_id,merchant_store_id,origin_type,label,country_code,status)
      VALUES (oA1,cA,sA,'warehouse','NL origin','NL','active'),
             (oDE,cA,sA,'warehouse','DE origin','DE','active');
    INSERT INTO public.merchant_store_sku_fulfillment_origins
      (shipping_profile_id,fulfillment_origin_id,company_id,merchant_store_id,priority,is_default,status)
      VALUES (spA,oA1,cA,sA,1,true,'active'), (spA,oDE,cA,sA,2,false,'active');

    INSERT INTO public.delivery_promise_profiles
      (id,scope_type,company_id,merchant_store_id,profile_code,version_number,display_name,timezone_name,handling_business_days,status)
      VALUES (ppA,'merchant_store',cA,sA,'m1c1dg-promise',1,'M1C1DG promise','Europe/Amsterdam',0,'active');
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id,weekday_iso,accepts_orders,order_cutoff_local_time,handover_enabled)
    SELECT ppA, w, w<=5, CASE WHEN w<=5 THEN time '17:00' END, w<=5 FROM generate_series(1,7) w;

    INSERT INTO public.merchant_store_sku_delivery_promise_assignments
      (id,company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status)
      VALUES (asgA,cA,sA,spA,oA1,ppA,'merchant_fulfilled',1,'active'),
             (asgDE,cA,sA,spA,oDE,ppA,'merchant_fulfilled',2,'active');

    INSERT INTO public.shipping_rate_cards (id,scope_type,company_id,merchant_store_id,carrier_code,service_code,currency_code,status,valid_from)
      VALUES (cardA,'merchant_store',cA,sA,'PN','STD','EUR','active','2020-01-01'),
             (cardBE,'merchant_store',cA,sA,'PN','STD','EUR','active','2020-01-01'),
             (cardSE,'merchant_store',cA,sA,'PN','STD','EUR','active','2020-01-01'),
             (cardDESE,'merchant_store',cA,sA,'PN','STD','EUR','active','2020-01-01');
    INSERT INTO public.shipping_rate_lanes (id,shipping_rate_card_id,card_company_id,card_merchant_store_id,origin_scope_type,fulfillment_origin_id,origin_country_code,destination_country_code,status)
      VALUES (laneA,cardA,cA,sA,'exact_origin',oA1,'NL','NL','active'),
             (laneBE,cardBE,cA,sA,'exact_origin',oA1,'NL','BE','active'),
             (laneSE,cardSE,cA,sA,'exact_origin',oA1,'NL','SE','active'),
             (laneDESE,cardDESE,cA,sA,'exact_origin',oDE,'DE','SE','active');

    INSERT INTO public.shipping_transit_time_profiles
      (id,scope_type,company_id,merchant_store_id,profile_code,version_number,carrier_code,service_code,origin_scope_type,fulfillment_origin_id,origin_country_code,destination_country_code,status)
      VALUES (tpA,'merchant_store',cA,sA,'m1c1dg-nl-nl',1,'PN','STD','exact_origin',oA1,'NL','NL','active'),
             (tpBE,'merchant_store',cA,sA,'m1c1dg-nl-be',1,'PN','STD','exact_origin',oA1,'NL','BE','active'),
             (tpSE,'merchant_store',cA,sA,'m1c1dg-nl-se',1,'PN','STD','exact_origin',oA1,'NL','SE','active'),
             (tpDESE,'merchant_store',cA,sA,'m1c1dg-de-se',1,'PN','STD','exact_origin',oDE,'DE','SE','active');
    INSERT INTO public.shipping_transit_time_weekday_rules
      (shipping_transit_time_profile_id,handover_weekday_iso,handover_supported,transit_min_business_days,transit_max_business_days)
    SELECT p, w, w<=5, CASE WHEN w<=5 THEN 1 END, CASE WHEN w<=5 THEN 2 END
      FROM unnest(ARRAY[tpA,tpBE,tpSE,tpDESE]) p, generate_series(1,7) w;
    INSERT INTO public.shipping_transit_delivery_weekdays
      (shipping_transit_time_profile_id,delivery_weekday_iso,delivery_enabled)
    SELECT p, w, w<=6 FROM unnest(ARRAY[tpA,tpBE,tpSE,tpDESE]) p, generate_series(1,7) w;

    INSERT INTO public.shipping_calendar_profiles
      (id,scope_type,company_id,merchant_store_id,calendar_code,version_number,calendar_type,country_code,timezone_name,status)
      VALUES (calO,'merchant_store',cA,sA,'m1c1dg-cal-o',1,'origin_handover','NL','Europe/Amsterdam','active'),
             (calC,'merchant_store',cA,sA,'m1c1dg-cal-c',1,'carrier_transit',NULL,'Europe/Amsterdam','active'),
             (calD,'merchant_store',cA,sA,'m1c1dg-cal-d',1,'destination_delivery','NL','Europe/Amsterdam','active');
    INSERT INTO public.shipping_transit_time_profile_calendars (shipping_transit_time_profile_id,shipping_calendar_profile_id,calendar_role)
      VALUES (tpA,calO,'origin_handover'),(tpA,calC,'carrier_transit'),(tpA,calD,'destination_delivery');

    INSERT INTO public.shipping_rate_lane_transit_profile_bindings (id,shipping_rate_lane_id,shipping_transit_time_profile_id,version_number,status)
      VALUES (bindA,laneA,tpA,1,'active'),(bindBE,laneBE,tpBE,1,'active'),
             (bindSE,laneSE,tpSE,1,'active'),(bindDESE,laneDESE,tpDESE,1,'active');

    SELECT count(*) INTO ob FROM public.outbox_events;
    SELECT count(*) INTO ab FROM public.agent_audit_log;
    SELECT count(*) INTO ce FROM public.channel_connections;

    -- T1 Monday before cut-off
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-02' OR r.carrier_handover_date<>'2026-03-02' OR r.earliest_delivery_date<>'2026-03-03' OR r.latest_delivery_date<>'2026-03-04' THEN f:=f+1; lg:=lg||n||':T1 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||' a'||coalesce(r.accepted_order_local_date::text,'-')||' h'||coalesce(r.carrier_handover_date::text,'-')||' '||coalesce(r.earliest_delivery_date::text,'-')||'..'||coalesce(r.latest_delivery_date::text,'-')||'; '; END IF;
    n:=n+1; IF r.promise_timezone<>'Europe/Amsterdam' OR r.destination_granularity<>'country' OR r.configuration_version_evidence NOT LIKE '%eta_resolved=true%' OR r.configuration_version_evidence NOT LIKE '%commercial_shipping_resolved=false%' OR r.rate_transit_binding_id<>bindA OR r.shipping_transit_time_profile_id<>tpA OR r.origin_calendar_profile_id<>calO OR r.carrier_calendar_profile_id<>calC OR r.destination_calendar_profile_id<>calD THEN f:=f+1; lg:=lg||n||':T1evidence '||coalesce(r.configuration_version_evidence,'-')||'; '; END IF;
    n:=n+1; IF r.shipment_ready_date<>'2026-03-02' THEN f:=f+1; lg:=lg||n||':T1ready '||coalesce(r.shipment_ready_date::text,'-')||'; '; END IF;

    -- T2 Monday after cut-off
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 18:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-03' OR r.earliest_delivery_date<>'2026-03-04' OR r.latest_delivery_date<>'2026-03-05' THEN f:=f+1; lg:=lg||n||':T2 '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||' '||coalesce(r.earliest_delivery_date::text,'-')||'..'||coalesce(r.latest_delivery_date::text,'-')||'; '; END IF;

    -- T3 Friday after cut-off
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-06 18:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-09' OR r.carrier_handover_date<>'2026-03-09' THEN f:=f+1; lg:=lg||n||':T3 '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||' h'||coalesce(r.carrier_handover_date::text,'-')||'; '; END IF;

    -- T4 weekend order, no acceptance
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-07 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-09' THEN f:=f+1; lg:=lg||n||':T4 '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||'; '; END IF;

    -- T5 Saturday handover enabled
    UPDATE public.delivery_promise_weekly_schedules SET accepts_orders=true, order_cutoff_local_time=time '12:00', handover_enabled=true
      WHERE delivery_promise_profile_id=ppA AND weekday_iso=6;
    UPDATE public.shipping_transit_time_weekday_rules SET handover_supported=true, transit_min_business_days=1, transit_max_business_days=1
      WHERE shipping_transit_time_profile_id=tpA AND handover_weekday_iso=6;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-07 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.carrier_handover_date<>'2026-03-07' OR r.earliest_delivery_date<>'2026-03-09' OR r.latest_delivery_date<>'2026-03-09' THEN f:=f+1; lg:=lg||n||':T5 '||r.resolution_status||' h'||coalesce(r.carrier_handover_date::text,'-')||' '||coalesce(r.earliest_delivery_date::text,'-')||'..'||coalesce(r.latest_delivery_date::text,'-')||'; '; END IF;
    UPDATE public.delivery_promise_weekly_schedules SET accepts_orders=false, order_cutoff_local_time=NULL, handover_enabled=false
      WHERE delivery_promise_profile_id=ppA AND weekday_iso=6;
    UPDATE public.shipping_transit_time_weekday_rules SET handover_supported=false, transit_min_business_days=NULL, transit_max_business_days=NULL
      WHERE shipping_transit_time_profile_id=tpA AND handover_weekday_iso=6;

    -- T6 handling > 0
    UPDATE public.delivery_promise_profiles SET handling_business_days=1 WHERE id=ppA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.shipment_ready_date<>'2026-03-03' OR r.carrier_handover_date<>'2026-03-03' OR r.earliest_delivery_date<>'2026-03-04' THEN f:=f+1; lg:=lg||n||':T6 '||r.resolution_status||' s'||coalesce(r.shipment_ready_date::text,'-')||' h'||coalesce(r.carrier_handover_date::text,'-')||'; '; END IF;
    -- T7 Friday after cut-off + 1 handling day
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-06 18:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-09' OR r.shipment_ready_date<>'2026-03-10' THEN f:=f+1; lg:=lg||n||':T7 '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||' s'||coalesce(r.shipment_ready_date::text,'-')||'; '; END IF;
    UPDATE public.delivery_promise_profiles SET handling_business_days=0 WHERE id=ppA;

    -- T8 origin blackout shifts handover only
    INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id,blackout_date,reason_code) VALUES (calO,'2026-03-02','public_holiday');
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.carrier_handover_date<>'2026-03-03' OR r.earliest_delivery_date<>'2026-03-04' THEN f:=f+1; lg:=lg||n||':T8 '||r.resolution_status||' h'||coalesce(r.carrier_handover_date::text,'-')||'; '; END IF;
    DELETE FROM public.shipping_calendar_blackout_dates WHERE shipping_calendar_profile_id=calO;

    -- T9 carrier blackout affects transit counting only
    INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id,blackout_date,reason_code) VALUES (calC,'2026-03-03','carrier_closed');
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.carrier_handover_date<>'2026-03-02' OR r.earliest_delivery_date<>'2026-03-04' OR r.latest_delivery_date<>'2026-03-05' THEN f:=f+1; lg:=lg||n||':T9 '||r.resolution_status||' h'||coalesce(r.carrier_handover_date::text,'-')||' '||coalesce(r.earliest_delivery_date::text,'-')||'..'||coalesce(r.latest_delivery_date::text,'-')||'; '; END IF;
    DELETE FROM public.shipping_calendar_blackout_dates WHERE shipping_calendar_profile_id=calC;

    -- T10 destination blackout affects final delivery only
    INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id,blackout_date,reason_code) VALUES (calD,'2026-03-03','public_holiday');
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.carrier_handover_date<>'2026-03-02' OR r.earliest_delivery_date<>'2026-03-04' OR r.latest_delivery_date<>'2026-03-04' THEN f:=f+1; lg:=lg||n||':T10 '||r.resolution_status||' '||coalesce(r.earliest_delivery_date::text,'-')||'..'||coalesce(r.latest_delivery_date::text,'-')||'; '; END IF;
    DELETE FROM public.shipping_calendar_blackout_dates WHERE shipping_calendar_profile_id=calD;

    -- T11..T13 routes
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneBE,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' THEN f:=f+1; lg:=lg||n||':T11 NL-BE '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneSE,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' THEN f:=f+1; lg:=lg||n||':T12 NL-SE '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgDE,laneDESE,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' THEN f:=f+1; lg:=lg||n||':T13 DE-SE '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;

    -- T14 DST start
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-29 01:30:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-30' THEN f:=f+1; lg:=lg||n||':T14 '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||'; '; END IF;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-27 18:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-03-30' OR r.earliest_delivery_date<>'2026-03-31' THEN f:=f+1; lg:=lg||n||':T14b '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||'; '; END IF;
    -- T15 DST end (ambiguous local hour, both passes)
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-10-25 00:30:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-10-26' THEN f:=f+1; lg:=lg||n||':T15 '||r.resolution_status||' a'||coalesce(r.accepted_order_local_date::text,'-')||'; '; END IF;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-10-25 01:30:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.accepted_order_local_date<>'2026-10-26' THEN f:=f+1; lg:=lg||n||':T15b '||r.resolution_status||'; '; END IF;

    -- T16 binding inactive
    UPDATE public.shipping_rate_lane_transit_profile_bindings SET status='inactive' WHERE id=bindA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'rate_transit_binding_inactive' OR r.earliest_delivery_date IS NOT NULL OR r.reason_code IS NULL THEN f:=f+1; lg:=lg||n||':T16 '||r.resolution_status||'; '; END IF;
    UPDATE public.shipping_rate_lane_transit_profile_bindings SET status='active' WHERE id=bindA;

    -- T17 binding missing
    DELETE FROM public.shipping_rate_lane_transit_profile_bindings WHERE id=bindA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'rate_transit_binding_missing' THEN f:=f+1; lg:=lg||n||':T17 '||r.resolution_status||'; '; END IF;
    INSERT INTO public.shipping_rate_lane_transit_profile_bindings (id,shipping_rate_lane_id,shipping_transit_time_profile_id,version_number,status)
      VALUES (bindA,laneA,tpA,1,'active');

    -- T18 deliberate corruption: two active bindings on one lane
    INSERT INTO public.shipping_rate_lane_transit_profile_bindings (id,shipping_rate_lane_id,shipping_transit_time_profile_id,version_number,status)
      VALUES (bindX,laneA,tpBE,2,'active');
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'ambiguous_configuration' THEN f:=f+1; lg:=lg||n||':T18 '||r.resolution_status||'; '; END IF;
    DELETE FROM public.shipping_rate_lane_transit_profile_bindings WHERE id=bindX;

    -- T19 inactive rate card
    UPDATE public.shipping_rate_cards SET status='inactive' WHERE id=cardA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'shipping_rate_inactive' THEN f:=f+1; lg:=lg||n||':T19 '||r.resolution_status||'; '; END IF;
    UPDATE public.shipping_rate_cards SET status='active' WHERE id=cardA;

    -- T20 inactive lane
    UPDATE public.shipping_rate_lanes SET status='inactive' WHERE id=laneA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'shipping_rate_inactive' THEN f:=f+1; lg:=lg||n||':T20 '||r.resolution_status||'; '; END IF;
    UPDATE public.shipping_rate_lanes SET status='active' WHERE id=laneA;

    -- T21 inactive assignment
    UPDATE public.merchant_store_sku_delivery_promise_assignments SET status='inactive' WHERE id=asgA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'promise_assignment_inactive' THEN f:=f+1; lg:=lg||n||':T21 '||r.resolution_status||'; '; END IF;
    UPDATE public.merchant_store_sku_delivery_promise_assignments SET status='active' WHERE id=asgA;

    -- T22 inactive shipping profile
    UPDATE public.merchant_store_sku_shipping_profiles SET status='inactive' WHERE id=spA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'shipping_profile_not_active' THEN f:=f+1; lg:=lg||n||':T22 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_profiles SET status='active' WHERE id=spA;

    -- T23 inactive origin
    UPDATE public.merchant_fulfillment_origins SET status='inactive' WHERE id=oA1;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'origin_inactive' THEN f:=f+1; lg:=lg||n||':T23 '||r.resolution_status||'; '; END IF;
    UPDATE public.merchant_fulfillment_origins SET status='active' WHERE id=oA1;

    -- T24 inactive eligibility
    UPDATE public.merchant_store_sku_fulfillment_origins SET status='inactive' WHERE shipping_profile_id=spA AND fulfillment_origin_id=oA1;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'origin_eligibility_inactive' THEN f:=f+1; lg:=lg||n||':T24 '||r.resolution_status||'; '; END IF;
    UPDATE public.merchant_store_sku_fulfillment_origins SET status='active' WHERE shipping_profile_id=spA AND fulfillment_origin_id=oA1;

    -- T25 inactive promise profile
    UPDATE public.delivery_promise_profiles SET status='inactive' WHERE id=ppA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'promise_profile_inactive' THEN f:=f+1; lg:=lg||n||':T25 '||r.resolution_status||'; '; END IF;
    UPDATE public.delivery_promise_profiles SET status='active' WHERE id=ppA;

    -- T26 incomplete weekly schedule
    DELETE FROM public.delivery_promise_weekly_schedules WHERE delivery_promise_profile_id=ppA AND weekday_iso=7;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'promise_weekly_schedule_incomplete' THEN f:=f+1; lg:=lg||n||':T26 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    INSERT INTO public.delivery_promise_weekly_schedules (delivery_promise_profile_id,weekday_iso,accepts_orders,order_cutoff_local_time,handover_enabled)
      VALUES (ppA,7,false,NULL,false);

    -- T27 inactive transit profile
    UPDATE public.shipping_transit_time_profiles SET status='inactive' WHERE id=tpA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'transit_profile_inactive' THEN f:=f+1; lg:=lg||n||':T27 '||r.resolution_status||'; '; END IF;
    UPDATE public.shipping_transit_time_profiles SET status='active' WHERE id=tpA;

    -- T28 incomplete transit weekday rules
    DELETE FROM public.shipping_transit_time_weekday_rules WHERE shipping_transit_time_profile_id=tpA AND handover_weekday_iso=7;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'transit_weekday_rules_incomplete' THEN f:=f+1; lg:=lg||n||':T28 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    INSERT INTO public.shipping_transit_time_weekday_rules (shipping_transit_time_profile_id,handover_weekday_iso,handover_supported,transit_min_business_days,transit_max_business_days)
      VALUES (tpA,7,false,NULL,NULL);

    -- T29 incomplete delivery weekdays
    DELETE FROM public.shipping_transit_delivery_weekdays WHERE shipping_transit_time_profile_id=tpA AND delivery_weekday_iso=7;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'transit_delivery_weekdays_incomplete' THEN f:=f+1; lg:=lg||n||':T29 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    INSERT INTO public.shipping_transit_delivery_weekdays (shipping_transit_time_profile_id,delivery_weekday_iso,delivery_enabled) VALUES (tpA,7,false);

    -- T30 inactive calendar
    UPDATE public.shipping_calendar_profiles SET status='inactive' WHERE id=calC;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'calendar_inactive' THEN f:=f+1; lg:=lg||n||':T30 '||r.resolution_status||'; '; END IF;
    UPDATE public.shipping_calendar_profiles SET status='active' WHERE id=calC;

    -- T31 carrier mismatch
    UPDATE public.shipping_transit_time_profiles SET carrier_code='XX' WHERE id=tpA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'carrier_mismatch' THEN f:=f+1; lg:=lg||n||':T31 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.shipping_transit_time_profiles SET carrier_code='PN' WHERE id=tpA;

    -- T32 service mismatch
    UPDATE public.shipping_transit_time_profiles SET service_code='EXP' WHERE id=tpA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'service_mismatch' THEN f:=f+1; lg:=lg||n||':T32 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.shipping_transit_time_profiles SET service_code='STD' WHERE id=tpA;

    -- T33 destination mismatch
    UPDATE public.shipping_transit_time_profiles SET destination_country_code='BE' WHERE id=tpA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'destination_mismatch' THEN f:=f+1; lg:=lg||n||':T33 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.shipping_transit_time_profiles SET destination_country_code='NL' WHERE id=tpA;

    -- T34 cross-tenant transit profile
    UPDATE public.shipping_transit_time_profiles SET company_id=cB, merchant_store_id=sB, fulfillment_origin_id=NULL, origin_scope_type='origin_country' WHERE id=tpA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'cross_tenant_transit_profile' THEN f:=f+1; lg:=lg||n||':T34 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.shipping_transit_time_profiles SET company_id=cA, merchant_store_id=sA, fulfillment_origin_id=oA1, origin_scope_type='exact_origin' WHERE id=tpA;

    -- T35 cross-tenant rate card
    INSERT INTO public.shipping_rate_cards (id,scope_type,company_id,merchant_store_id,carrier_code,service_code,currency_code,status,valid_from)
      VALUES (cardX,'merchant_store',cB,sB,'PN','STD','EUR','active','2020-01-01');
    INSERT INTO public.shipping_rate_lanes (id,shipping_rate_card_id,card_company_id,card_merchant_store_id,origin_scope_type,fulfillment_origin_id,origin_country_code,destination_country_code,status)
      VALUES (laneX,cardX,cB,sB,'origin_country',NULL,'NL','NL','active');
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneX,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'cross_tenant_rate_card' THEN f:=f+1; lg:=lg||n||':T35 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    DELETE FROM public.shipping_rate_lanes WHERE id=laneX;
    DELETE FROM public.shipping_rate_cards WHERE id=cardX;

    -- T36 lane origin mismatch
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgDE,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'lane_origin_country_mismatch' THEN f:=f+1; lg:=lg||n||':T36 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;

    -- T37..T40 special handling fail-closed
    UPDATE public.merchant_store_sku_shipping_profiles SET pickup_only=true WHERE id=spA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'special_handling_unsupported' OR r.reason_code<>'pickup_only' THEN f:=f+1; lg:=lg||n||':T37 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_profiles SET pickup_only=false, dangerous_goods=true WHERE id=spA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.reason_code<>'dangerous_goods' THEN f:=f+1; lg:=lg||n||':T38 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_profiles SET dangerous_goods=false, handling_class='cold_chain' WHERE id=spA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.reason_code<>'cold_chain' THEN f:=f+1; lg:=lg||n||':T39 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_profiles SET handling_class='standard', oversized=true WHERE id=spA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.reason_code<>'oversized_without_carrier_capability' THEN f:=f+1; lg:=lg||n||':T40 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_profiles SET oversized=false WHERE id=spA;

    -- T41 bulky alone is not pallet
    UPDATE public.merchant_store_sku_shipping_profiles SET handling_class='bulky' WHERE id=spA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' THEN f:=f+1; lg:=lg||n||':T41 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_profiles SET handling_class='standard' WHERE id=spA;

    -- T42 pallet requirement unresolved (R-S4)
    UPDATE public.merchant_store_sku_shipping_packages SET weight_grams=40000 WHERE id=pkg1;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.reason_code<>'pallet_requirement_unresolved' THEN f:=f+1; lg:=lg||n||':T42 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    UPDATE public.merchant_store_sku_shipping_packages SET weight_grams=1000 WHERE id=pkg1;

    -- T43 multi-parcel single service
    INSERT INTO public.merchant_store_sku_shipping_packages (id,shipping_profile_id,company_id,merchant_store_id,package_number,quantity_per_package,weight_grams,length_mm,width_mm,height_mm)
      VALUES (pkg2,spA,cA,sA,2,1,900,300,200,100);
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' THEN f:=f+1; lg:=lg||n||':T43 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;

    -- T44 multi-parcel mixed service
    INSERT INTO public.shipping_rate_cards (id,scope_type,company_id,merchant_store_id,carrier_code,service_code,currency_code,status,valid_from)
      VALUES (cardX,'merchant_store',cA,sA,'PN','EXP','EUR','active','2020-01-01');
    INSERT INTO public.shipping_rate_lanes (id,shipping_rate_card_id,card_company_id,card_merchant_store_id,origin_scope_type,fulfillment_origin_id,origin_country_code,destination_country_code,status)
      VALUES (laneX,cardX,cA,sA,'exact_origin',oA1,'NL','NL','active');
    INSERT INTO public.shipping_transit_time_profiles (id,scope_type,company_id,merchant_store_id,profile_code,version_number,carrier_code,service_code,origin_scope_type,fulfillment_origin_id,origin_country_code,destination_country_code,status)
      VALUES (tpX,'merchant_store',cA,sA,'m1c1dg-nl-nl-exp',1,'PN','EXP','exact_origin',oA1,'NL','NL','active');
    INSERT INTO public.shipping_transit_time_weekday_rules (shipping_transit_time_profile_id,handover_weekday_iso,handover_supported,transit_min_business_days,transit_max_business_days)
      SELECT tpX, w, w<=5, CASE WHEN w<=5 THEN 1 END, CASE WHEN w<=5 THEN 1 END FROM generate_series(1,7) w;
    INSERT INTO public.shipping_transit_delivery_weekdays (shipping_transit_time_profile_id,delivery_weekday_iso,delivery_enabled)
      SELECT tpX, w, w<=6 FROM generate_series(1,7) w;
    INSERT INTO public.shipping_rate_lane_transit_profile_bindings (id,shipping_rate_lane_id,shipping_transit_time_profile_id,version_number,status)
      VALUES (gen_random_uuid(),laneX,tpX,1,'active');
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.reason_code<>'multi_parcel_mixed_service' THEN f:=f+1; lg:=lg||n||':T44 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    DELETE FROM public.shipping_rate_lane_transit_profile_bindings WHERE shipping_rate_lane_id=laneX;
    DELETE FROM public.shipping_transit_delivery_weekdays WHERE shipping_transit_time_profile_id=tpX;
    DELETE FROM public.shipping_transit_time_weekday_rules WHERE shipping_transit_time_profile_id=tpX;
    DELETE FROM public.shipping_transit_time_profiles WHERE id=tpX;
    DELETE FROM public.shipping_rate_lanes WHERE id=laneX;
    DELETE FROM public.shipping_rate_cards WHERE id=cardX;
    DELETE FROM public.merchant_store_sku_shipping_packages WHERE id=pkg2;

    -- T45 destination unavailable
    UPDATE public.shipping_transit_delivery_weekdays SET delivery_enabled=false WHERE shipping_transit_time_profile_id=tpSE;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneSE,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'destination_unavailable' THEN f:=f+1; lg:=lg||n||':T45 '||r.resolution_status||'; '; END IF;
    UPDATE public.shipping_transit_delivery_weekdays SET delivery_enabled=(delivery_weekday_iso<=6) WHERE shipping_transit_time_profile_id=tpSE;

    -- T46 no valid handover within horizon
    UPDATE public.delivery_promise_weekly_schedules SET handover_enabled=false WHERE delivery_promise_profile_id=ppA;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'no_valid_handover_within_horizon' OR r.earliest_delivery_date IS NOT NULL THEN f:=f+1; lg:=lg||n||':T46 '||r.resolution_status||'; '; END IF;
    UPDATE public.delivery_promise_weekly_schedules SET handover_enabled=(weekday_iso<=5) WHERE delivery_promise_profile_id=ppA;

    -- T47 no valid delivery within horizon
    UPDATE public.shipping_transit_delivery_weekdays SET delivery_enabled=(delivery_weekday_iso=7) WHERE shipping_transit_time_profile_id=tpA;
    INSERT INTO public.shipping_calendar_blackout_dates (shipping_calendar_profile_id,blackout_date,reason_code)
      SELECT calD, d::date, 'warehouse_closed' FROM generate_series('2026-03-01'::date,'2027-06-01'::date,'1 day') d WHERE extract(isodow from d)=7;
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'no_valid_delivery_within_horizon' THEN f:=f+1; lg:=lg||n||':T47 '||r.resolution_status||'; '; END IF;
    DELETE FROM public.shipping_calendar_blackout_dates WHERE shipping_calendar_profile_id=calD;
    UPDATE public.shipping_transit_delivery_weekdays SET delivery_enabled=(delivery_weekday_iso<=6) WHERE shipping_transit_time_profile_id=tpA;

    -- T48 null input contract
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(NULL,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'invalid_configuration' OR r.reason_code<>'null_input_reference' THEN f:=f+1; lg:=lg||n||':T48 '||r.resolution_status||'; '; END IF;

    -- T49 baseline restored
    SELECT * INTO r FROM internal_shipping.resolve_final_eta(asgA,laneA,'2026-03-02 09:00:00+00');
    n:=n+1; IF r.resolution_status<>'resolved' OR r.earliest_delivery_date<>'2026-03-03' OR r.latest_delivery_date<>'2026-03-04' THEN f:=f+1; lg:=lg||n||':T49 '||r.resolution_status||'/'||coalesce(r.reason_code,'')||'; '; END IF;
    n:=n+1; IF r.earliest_delivery_date > r.latest_delivery_date THEN f:=f+1; lg:=lg||n||':T49range; '; END IF;

    -- T50 read-only proof
    n:=n+1; IF (SELECT count(*) FROM public.outbox_events)<>ob OR (SELECT count(*) FROM public.agent_audit_log)<>ab OR (SELECT count(*) FROM public.channel_connections)<>ce THEN f:=f+1; lg:=lg||n||':T50 side effects; '; END IF;

    RAISE EXCEPTION 'M1C1DG_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'M1C1DG_ROLLBACK' THEN
      RAISE EXCEPTION 'M1C1DG HARNESS ABORTED after % assertions (% failed): % | log: %', n, f, SQLERRM, lg;
    END IF;
  END;

  IF f > 0 THEN
    RAISE EXCEPTION 'M1C1DG HARNESS FAIL: %/% assertions failed: %', f, n, lg;
  END IF;
  RAISE NOTICE 'M1C1DG HARNESS PASS: % assertions', n;
END
$h$;

DO $inv$
DECLARE bad text := '';
BEGIN
  IF (SELECT count(*) FROM public.shipping_rate_cards)<>0
     OR (SELECT count(*) FROM public.shipping_rate_lanes)<>0
     OR (SELECT count(*) FROM public.shipping_rate_lane_transit_profile_bindings)<>0
     OR (SELECT count(*) FROM public.shipping_transit_time_profiles)<>0
     OR (SELECT count(*) FROM public.shipping_calendar_profiles)<>0
     OR (SELECT count(*) FROM public.delivery_promise_profiles)<>0
     OR (SELECT count(*) FROM public.merchant_store_sku_delivery_promise_assignments)<>0
     OR (SELECT count(*) FROM public.merchant_fulfillment_origins)<>0
     OR (SELECT count(*) FROM public.merchant_store_sku_shipping_profiles)<>0 THEN
    bad := bad||'shipping/promise rows leaked; ';
  END IF;
  IF (SELECT count(*) FROM public.tax_categories)<>4 OR (SELECT count(*) FROM public.tax_rate_bands)<>9
     OR (SELECT count(*) FROM public.tax_rate_versions)<>5 THEN bad := bad||'tax counts drifted; '; END IF;
  IF (SELECT count(*) FROM public.merchant_store_offer_prices)<>0
     OR (SELECT count(*) FROM public.borvat_direct_listing_publications)<>0 THEN bad := bad||'price/publication rows; '; END IF;
  IF EXISTS (SELECT 1 FROM public.channel_connections WHERE live_authorized_at IS NOT NULL) THEN
    bad := bad||'R-C2 violated: a channel connection is live authorized; ';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace nx ON nx.oid=p.pronamespace
             WHERE nx.nspname='public' AND p.proname='place_order' AND p.prosrc NOT LIKE '%permanently disabled%') THEN
    bad := bad||'place_order not fail-closed; ';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rr(x)
             WHERE has_schema_privilege(rr.x,'internal_shipping','USAGE')
                OR has_function_privilege(rr.x,'internal_shipping.resolve_final_eta(uuid,uuid,timestamptz)','EXECUTE')) THEN
    bad := bad||'non-owner access to internal resolver; ';
  END IF;
  IF bad <> '' THEN RAISE EXCEPTION 'M1C1DG POST-INVARIANTS FAILED: %', bad; END IF;
END
$inv$;