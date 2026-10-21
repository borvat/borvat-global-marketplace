-- M1C-1D-G — PRIVATE INTERNAL FINAL ETA RESOLVER FOUNDATION
-- Internal, owner-only, read-only. No application EXECUTE. No writes. No permanent rows.
CREATE SCHEMA IF NOT EXISTS internal_shipping AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA internal_shipping FROM PUBLIC;
DO $rev$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','sandbox_exec'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA internal_shipping FROM %I', r);
    END IF;
  END LOOP;
END $rev$;

COMMENT ON SCHEMA internal_shipping IS
  'M1C-1D-G: owner-only internal shipping computation schema. No tables. No USAGE for any non-owner role.';

CREATE OR REPLACE FUNCTION internal_shipping.resolve_final_eta(
  p_delivery_promise_assignment_id uuid,
  p_shipping_rate_lane_id uuid,
  p_order_received_at timestamptz
)
RETURNS TABLE (
  resolution_status text,
  reason_code text,
  earliest_delivery_date date,
  latest_delivery_date date,
  accepted_order_local_date date,
  shipment_ready_date date,
  carrier_handover_date date,
  promise_timezone text,
  delivery_promise_profile_id uuid,
  delivery_promise_assignment_id uuid,
  shipping_rate_lane_id uuid,
  rate_transit_binding_id uuid,
  shipping_transit_time_profile_id uuid,
  origin_calendar_profile_id uuid,
  carrier_calendar_profile_id uuid,
  destination_calendar_profile_id uuid,
  destination_granularity text,
  configuration_version_evidence text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  c_horizon   constant int := 400;   -- fixed, caller cannot widen (BOR-DEC-095)
  v_status    text := 'resolved';
  v_reason    text := 'ok';
  v_asg       public.merchant_store_sku_delivery_promise_assignments%ROWTYPE;
  v_sp        public.merchant_store_sku_shipping_profiles%ROWTYPE;
  v_org       public.merchant_fulfillment_origins%ROWTYPE;
  v_pp        public.delivery_promise_profiles%ROWTYPE;
  v_lane      public.shipping_rate_lanes%ROWTYPE;
  v_card      public.shipping_rate_cards%ROWTYPE;
  v_bind      public.shipping_rate_lane_transit_profile_bindings%ROWTYPE;
  v_tp        public.shipping_transit_time_profiles%ROWTYPE;
  v_elig_ok   boolean;
  v_n         int;
  v_accepts   boolean[] := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::boolean[];
  v_cutoff    time[]    := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::time[];
  v_phand     boolean[] := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::boolean[];
  v_tsup      boolean[] := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::boolean[];
  v_tmin      int[]     := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::int[];
  v_tmax      int[]     := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::int[];
  v_deliv     boolean[] := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::boolean[];
  v_cal_o     uuid; v_cal_c uuid; v_cal_d uuid;
  v_bo        date[] := '{}';
  v_bc        date[] := '{}';
  v_bd        date[] := '{}';
  v_tz        text;
  v_local_ts  timestamp;
  v_ldate     date;
  v_ltime     time;
  v_acc       date;
  v_ready     date;
  v_hand      date;
  v_arr_min   date;
  v_arr_max   date;
  v_early     date;
  v_late      date;
  v_d         date;
  v_i         int;
  v_cnt       int;
  v_dow       int;
  v_pkgs      int := 0;
  v_services  int := 0;
  v_evidence  text := '';
  v_bind_id   uuid; v_tp_id uuid; v_pp_id uuid;
  t_bool boolean; t_bool2 boolean; t_time time; t_int1 int; t_int2 int;
BEGIN
  BEGIN
    -- 0. input contract -------------------------------------------------
    IF p_delivery_promise_assignment_id IS NULL OR p_shipping_rate_lane_id IS NULL
       OR p_order_received_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='null_input_reference';
    END IF;

    -- 1. assignment path -------------------------------------------------
    SELECT * INTO v_asg FROM public.merchant_store_sku_delivery_promise_assignments
      WHERE id = p_delivery_promise_assignment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='assignment_not_found';
    END IF;
    v_pp_id := v_asg.delivery_promise_profile_id;
    IF v_asg.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='promise_assignment_inactive', DETAIL='assignment_status_'||v_asg.status;
    END IF;

    SELECT * INTO v_sp FROM public.merchant_store_sku_shipping_profiles WHERE id = v_asg.shipping_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='shipping_profile_not_found';
    END IF;
    IF v_sp.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='shipping_profile_not_active';
    END IF;
    IF v_sp.company_id <> v_asg.company_id OR v_sp.merchant_store_id <> v_asg.merchant_store_id THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='cross_tenant_shipping_profile';
    END IF;

    SELECT * INTO v_org FROM public.merchant_fulfillment_origins WHERE id = v_asg.fulfillment_origin_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='origin_not_found';
    END IF;
    IF v_org.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='origin_inactive', DETAIL='origin_status_'||v_org.status;
    END IF;
    IF v_org.company_id <> v_asg.company_id OR v_org.merchant_store_id <> v_asg.merchant_store_id THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='cross_tenant_origin';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.merchant_store_sku_fulfillment_origins e
       WHERE e.shipping_profile_id = v_asg.shipping_profile_id
         AND e.fulfillment_origin_id = v_asg.fulfillment_origin_id
         AND e.company_id = v_asg.company_id
         AND e.merchant_store_id = v_asg.merchant_store_id
         AND e.status = 'active') INTO v_elig_ok;
    IF NOT v_elig_ok THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='origin_eligibility_inactive', DETAIL='no_active_eligibility_row';
    END IF;

    -- 2. special handling, fail closed (BOR-DEC-099) ----------------------
    IF v_sp.pickup_only THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='special_handling_unsupported', DETAIL='pickup_only';
    END IF;
    IF v_sp.dangerous_goods THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='special_handling_unsupported', DETAIL='dangerous_goods';
    END IF;
    IF v_sp.handling_class = 'cold_chain' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='special_handling_unsupported', DETAIL='cold_chain';
    END IF;
    IF v_sp.oversized THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='special_handling_unsupported', DETAIL='oversized_without_carrier_capability';
    END IF;
    -- pallet has no trusted signal in the current model (R-S4): any package beyond
    -- the documented parcel envelope is treated as pallet-requiring and fails closed.
    -- 'bulky' alone is NEVER treated as pallet.
    SELECT count(*) INTO v_pkgs FROM public.merchant_store_sku_shipping_packages p
      WHERE p.shipping_profile_id = v_sp.id;
    IF EXISTS (SELECT 1 FROM public.merchant_store_sku_shipping_packages p
                WHERE p.shipping_profile_id = v_sp.id
                  AND (p.weight_grams > 31500 OR greatest(p.length_mm,p.width_mm,p.height_mm) > 1750)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='special_handling_unsupported', DETAIL='pallet_requirement_unresolved';
    END IF;

    -- 3. promise path ------------------------------------------------------
    SELECT * INTO v_pp FROM public.delivery_promise_profiles WHERE id = v_asg.delivery_promise_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='promise_profile_not_found';
    END IF;
    IF v_pp.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='promise_profile_inactive', DETAIL='promise_status_'||v_pp.status;
    END IF;
    IF v_pp.scope_type IS DISTINCT FROM v_asg.promise_scope_type THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='promise_scope_fulfillment_mode_mismatch';
    END IF;
    IF v_pp.scope_type = 'merchant_store'
       AND (v_pp.company_id IS DISTINCT FROM v_asg.company_id
            OR v_pp.merchant_store_id IS DISTINCT FROM v_asg.merchant_store_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='cross_tenant_promise_profile';
    END IF;
    v_tz := v_pp.timezone_name;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = v_tz) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='invalid_iana_timezone';
    END IF;
    SELECT count(*) INTO v_n FROM public.delivery_promise_weekly_schedules s
      WHERE s.delivery_promise_profile_id = v_pp.id;
    IF v_n <> 7 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='promise_weekly_schedule_incomplete';
    END IF;
    FOR v_i IN 1..7 LOOP
      t_bool := NULL; t_time := NULL; t_bool2 := NULL;
      SELECT s.accepts_orders, s.order_cutoff_local_time, s.handover_enabled
        INTO t_bool, t_time, t_bool2
        FROM public.delivery_promise_weekly_schedules s
       WHERE s.delivery_promise_profile_id = v_pp.id AND s.weekday_iso = v_i;
      v_accepts[v_i] := t_bool; v_cutoff[v_i] := t_time; v_phand[v_i] := t_bool2;
      IF v_accepts[v_i] IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='promise_weekly_schedule_incomplete';
      END IF;
      IF v_accepts[v_i] AND v_cutoff[v_i] IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='promise_cutoff_missing';
      END IF;
    END LOOP;

    -- 4. rate path ---------------------------------------------------------
    SELECT * INTO v_lane FROM public.shipping_rate_lanes WHERE id = p_shipping_rate_lane_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='rate_lane_not_found';
    END IF;
    IF v_lane.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='shipping_rate_inactive', DETAIL='lane_status_'||v_lane.status;
    END IF;
    SELECT * INTO v_card FROM public.shipping_rate_cards WHERE id = v_lane.shipping_rate_card_id;
    IF v_card.status <> 'active'
       OR v_card.valid_from > p_order_received_at
       OR (v_card.valid_to IS NOT NULL AND v_card.valid_to <= p_order_received_at) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='shipping_rate_inactive', DETAIL='rate_card_not_operational';
    END IF;
    IF v_card.scope_type = 'merchant_store'
       AND (v_card.company_id IS DISTINCT FROM v_asg.company_id
            OR v_card.merchant_store_id IS DISTINCT FROM v_asg.merchant_store_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='cross_tenant_rate_card';
    END IF;
    IF v_lane.origin_country_code <> v_org.country_code THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='lane_origin_country_mismatch';
    END IF;
    IF v_lane.origin_scope_type = 'exact_origin'
       AND v_lane.fulfillment_origin_id IS DISTINCT FROM v_asg.fulfillment_origin_id THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='lane_exact_origin_mismatch';
    END IF;

    -- 5. binding path (BOR-DEC-091/092) -----------------------------------
    SELECT count(*) INTO v_n FROM public.shipping_rate_lane_transit_profile_bindings b
      WHERE b.shipping_rate_lane_id = v_lane.id AND b.status = 'active';
    IF v_n > 1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ambiguous_configuration', DETAIL='multiple_active_lane_bindings';
    ELSIF v_n = 0 THEN
      IF EXISTS (SELECT 1 FROM public.shipping_rate_lane_transit_profile_bindings b
                  WHERE b.shipping_rate_lane_id = v_lane.id) THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='rate_transit_binding_inactive', DETAIL='no_active_binding_version';
      ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='rate_transit_binding_missing', DETAIL='lane_has_no_binding';
      END IF;
    END IF;
    SELECT * INTO v_bind FROM public.shipping_rate_lane_transit_profile_bindings b
      WHERE b.shipping_rate_lane_id = v_lane.id AND b.status = 'active';
    v_bind_id := v_bind.id;

    -- 6. transit path -------------------------------------------------------
    SELECT * INTO v_tp FROM public.shipping_transit_time_profiles WHERE id = v_bind.shipping_transit_time_profile_id;
    v_tp_id := v_tp.id;
    IF v_tp.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='transit_profile_inactive', DETAIL='transit_status_'||v_tp.status;
    END IF;
    IF v_tp.carrier_code <> v_card.carrier_code THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='carrier_mismatch';
    END IF;
    IF v_tp.service_code <> v_card.service_code THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='service_mismatch';
    END IF;
    IF v_tp.destination_country_code <> v_lane.destination_country_code THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='destination_mismatch';
    END IF;
    IF v_tp.origin_country_code <> v_org.country_code THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='transit_origin_country_mismatch';
    END IF;
    IF v_tp.origin_scope_type = 'exact_origin'
       AND v_tp.fulfillment_origin_id IS DISTINCT FROM v_asg.fulfillment_origin_id THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='transit_exact_origin_mismatch';
    END IF;
    IF v_tp.scope_type = 'merchant_store'
       AND (v_tp.company_id IS DISTINCT FROM v_asg.company_id
            OR v_tp.merchant_store_id IS DISTINCT FROM v_asg.merchant_store_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='cross_tenant_transit_profile';
    END IF;

    SELECT count(*) INTO v_n FROM public.shipping_transit_time_weekday_rules r
      WHERE r.shipping_transit_time_profile_id = v_tp.id;
    IF v_n <> 7 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='transit_weekday_rules_incomplete';
    END IF;
    FOR v_i IN 1..7 LOOP
      t_bool := NULL; t_int1 := NULL; t_int2 := NULL;
      SELECT r.handover_supported, r.transit_min_business_days, r.transit_max_business_days
        INTO t_bool, t_int1, t_int2
        FROM public.shipping_transit_time_weekday_rules r
       WHERE r.shipping_transit_time_profile_id = v_tp.id AND r.handover_weekday_iso = v_i;
      v_tsup[v_i] := t_bool; v_tmin[v_i] := t_int1; v_tmax[v_i] := t_int2;
      IF v_tsup[v_i] IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='transit_weekday_rules_incomplete';
      END IF;
    END LOOP;

    SELECT count(*) INTO v_n FROM public.shipping_transit_delivery_weekdays w
      WHERE w.shipping_transit_time_profile_id = v_tp.id;
    IF v_n <> 7 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='transit_delivery_weekdays_incomplete';
    END IF;
    FOR v_i IN 1..7 LOOP
      t_bool := NULL;
      SELECT w.delivery_enabled INTO t_bool
        FROM public.shipping_transit_delivery_weekdays w
       WHERE w.shipping_transit_time_profile_id = v_tp.id AND w.delivery_weekday_iso = v_i;
      IF t_bool IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='transit_delivery_weekdays_incomplete';
      END IF;
      v_deliv[v_i] := t_bool;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM unnest(v_deliv) x WHERE x) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='destination_unavailable', DETAIL='no_enabled_delivery_weekday';
    END IF;

    -- 7. calendars, strictly isolated per stage (BOR-DEC-097) --------------
    FOR v_i IN 1..3 LOOP
      DECLARE
        v_role text := (ARRAY['origin_handover','carrier_transit','destination_delivery'])[v_i];
        v_cid  uuid;
        v_ctype text;
        v_cstat text;
      BEGIN
        SELECT c.shipping_calendar_profile_id, p.calendar_type, p.status
          INTO v_cid, v_ctype, v_cstat
          FROM public.shipping_transit_time_profile_calendars c
          JOIN public.shipping_calendar_profiles p ON p.id = c.shipping_calendar_profile_id
         WHERE c.shipping_transit_time_profile_id = v_tp.id AND c.calendar_role = v_role;
        IF v_cid IS NOT NULL THEN
          IF v_ctype <> v_role THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='calendar_role_mismatch_'||v_role;
          END IF;
          IF v_cstat <> 'active' THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='calendar_inactive', DETAIL='calendar_'||v_role||'_status_'||v_cstat;
          END IF;
          IF v_i = 1 THEN
            v_cal_o := v_cid;
            SELECT coalesce(array_agg(b.blackout_date),'{}') INTO v_bo
              FROM public.shipping_calendar_blackout_dates b WHERE b.shipping_calendar_profile_id = v_cid;
          ELSIF v_i = 2 THEN
            v_cal_c := v_cid;
            SELECT coalesce(array_agg(b.blackout_date),'{}') INTO v_bc
              FROM public.shipping_calendar_blackout_dates b WHERE b.shipping_calendar_profile_id = v_cid;
          ELSE
            v_cal_d := v_cid;
            SELECT coalesce(array_agg(b.blackout_date),'{}') INTO v_bd
              FROM public.shipping_calendar_blackout_dates b WHERE b.shipping_calendar_profile_id = v_cid;
          END IF;
        END IF;
      END;
    END LOOP;

    -- 8. multi-parcel service coherence (fail closed, never guess) ---------
    IF v_pkgs > 1 THEN
      SELECT count(DISTINCT rc.service_code) INTO v_services
        FROM public.shipping_rate_lanes l
        JOIN public.shipping_rate_cards rc ON rc.id = l.shipping_rate_card_id
        JOIN public.shipping_rate_lane_transit_profile_bindings b
             ON b.shipping_rate_lane_id = l.id AND b.status = 'active'
       WHERE l.status = 'active' AND rc.status = 'active'
         AND l.origin_country_code = v_lane.origin_country_code
         AND l.destination_country_code = v_lane.destination_country_code
         AND (rc.scope_type = 'platform'
              OR (rc.company_id = v_asg.company_id AND rc.merchant_store_id = v_asg.merchant_store_id))
         AND (l.origin_scope_type = 'origin_country' OR l.fulfillment_origin_id = v_asg.fulfillment_origin_id);
      IF v_services > 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='special_handling_unsupported', DETAIL='multi_parcel_mixed_service';
      END IF;
    END IF;

    -- 9. cut-off and acceptance date (absolute -> IANA local) --------------
    v_local_ts := p_order_received_at AT TIME ZONE v_tz;
    v_ldate := v_local_ts::date;
    v_ltime := v_local_ts::time;
    v_acc := NULL;
    FOR v_i IN 0..c_horizon LOOP
      v_d := v_ldate + v_i;
      v_dow := extract(isodow from v_d)::int;
      IF v_accepts[v_dow] THEN
        IF v_i > 0 OR v_ltime <= v_cutoff[v_dow] THEN
          v_acc := v_d; EXIT;
        END IF;
      END IF;
    END LOOP;
    IF v_acc IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no_valid_handover_within_horizon', DETAIL='no_order_acceptance_day';
    END IF;

    -- 10. handling -> shipment ready ---------------------------------------
    v_ready := v_acc;
    IF v_pp.handling_business_days > 0 THEN
      v_cnt := 0; v_d := v_acc;
      FOR v_i IN 1..c_horizon LOOP
        v_d := v_d + 1;
        v_dow := extract(isodow from v_d)::int;
        IF v_accepts[v_dow] AND NOT (v_d = ANY (v_bo)) THEN
          v_cnt := v_cnt + 1;
          IF v_cnt = v_pp.handling_business_days THEN EXIT; END IF;
        END IF;
      END LOOP;
      IF v_cnt < v_pp.handling_business_days THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no_valid_handover_within_horizon', DETAIL='handling_days_exceed_horizon';
      END IF;
      v_ready := v_d;
    END IF;

    -- 11. carrier handover --------------------------------------------------
    v_hand := NULL;
    FOR v_i IN 0..c_horizon LOOP
      v_d := v_ready + v_i;
      v_dow := extract(isodow from v_d)::int;
      IF v_phand[v_dow] AND v_tsup[v_dow] AND NOT (v_d = ANY (v_bo)) THEN
        v_hand := v_d; EXIT;
      END IF;
    END LOOP;
    IF v_hand IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no_valid_handover_within_horizon', DETAIL='no_handover_day';
    END IF;
    v_dow := extract(isodow from v_hand)::int;

    -- 12. transit min / max (carrier_transit calendar only) -----------------
    v_arr_min := v_hand; v_cnt := 0; v_d := v_hand;
    IF v_tmin[v_dow] > 0 THEN
      FOR v_i IN 1..c_horizon LOOP
        v_d := v_d + 1;
        IF NOT (v_d = ANY (v_bc)) THEN
          v_cnt := v_cnt + 1;
          IF v_cnt = v_tmin[v_dow] THEN EXIT; END IF;
        END IF;
      END LOOP;
      IF v_cnt < v_tmin[v_dow] THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no_valid_delivery_within_horizon', DETAIL='transit_min_exceeds_horizon';
      END IF;
      v_arr_min := v_d;
    END IF;
    v_arr_max := v_hand; v_cnt := 0; v_d := v_hand;
    IF v_tmax[v_dow] > 0 THEN
      FOR v_i IN 1..c_horizon LOOP
        v_d := v_d + 1;
        IF NOT (v_d = ANY (v_bc)) THEN
          v_cnt := v_cnt + 1;
          IF v_cnt = v_tmax[v_dow] THEN EXIT; END IF;
        END IF;
      END LOOP;
      IF v_cnt < v_tmax[v_dow] THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no_valid_delivery_within_horizon', DETAIL='transit_max_exceeds_horizon';
      END IF;
      v_arr_max := v_d;
    END IF;

    -- 13. delivery alignment (destination_delivery calendar only) -----------
    v_early := NULL;
    FOR v_i IN 0..c_horizon LOOP
      v_d := v_arr_min + v_i;
      IF v_deliv[extract(isodow from v_d)::int] AND NOT (v_d = ANY (v_bd)) THEN
        v_early := v_d; EXIT;
      END IF;
    END LOOP;
    v_late := NULL;
    FOR v_i IN 0..c_horizon LOOP
      v_d := v_arr_max + v_i;
      IF v_deliv[extract(isodow from v_d)::int] AND NOT (v_d = ANY (v_bd)) THEN
        v_late := v_d; EXIT;
      END IF;
    END LOOP;
    IF v_early IS NULL OR v_late IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no_valid_delivery_within_horizon', DETAIL='no_delivery_day';
    END IF;
    IF v_early > v_late THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='invalid_configuration', DETAIL='earliest_after_latest';
    END IF;

    v_status := 'resolved'; v_reason := 'ok';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_status = MESSAGE_TEXT, v_reason = PG_EXCEPTION_DETAIL;
    v_early := NULL; v_late := NULL; v_acc := NULL; v_ready := NULL; v_hand := NULL;
  END;

  v_evidence := 'eta_resolved=' || (v_status = 'resolved')::text
    || '; commercial_shipping_resolved=false'
    || '; destination_granularity=country'
    || '; horizon_days=' || c_horizon
    || '; assignment_v=' || coalesce(v_asg.version_number::text,'-')
    || '; promise_profile=' || coalesce(v_pp.profile_code,'-') || '@v' || coalesce(v_pp.version_number::text,'-')
    || '; rate_card=' || coalesce(v_card.carrier_code,'-') || '/' || coalesce(v_card.service_code,'-')
    || '; binding_v=' || coalesce(v_bind.version_number::text,'-')
    || '; transit_profile=' || coalesce(v_tp.profile_code,'-') || '@v' || coalesce(v_tp.version_number::text,'-')
    || '; route=' || coalesce(v_org.country_code,'-') || '->' || coalesce(v_lane.destination_country_code,'-')
    || '; tz=' || coalesce(v_tz,'-');

  RETURN QUERY SELECT
    v_status, v_reason, v_early, v_late, v_acc, v_ready, v_hand, v_tz,
    v_pp_id, p_delivery_promise_assignment_id, p_shipping_rate_lane_id,
    v_bind_id, v_tp_id, v_cal_o, v_cal_c, v_cal_d,
    'country'::text, v_evidence;
END
$fn$;

ALTER FUNCTION internal_shipping.resolve_final_eta(uuid,uuid,timestamptz) OWNER TO postgres;

COMMENT ON FUNCTION internal_shipping.resolve_final_eta(uuid,uuid,timestamptz) IS
  'M1C-1D-G internal read-only final ETA resolver. eta_resolved does NOT mean commercial_shipping_resolved: this function never computes shipping charges, free-shipping thresholds, VAT or carrier cost. Country-level destination granularity only (R-S5). No application EXECUTE (BOR-DEC-095).';

REVOKE ALL ON FUNCTION internal_shipping.resolve_final_eta(uuid,uuid,timestamptz) FROM PUBLIC;
DO $rev2$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','sandbox_exec'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION internal_shipping.resolve_final_eta(uuid,uuid,timestamptz) FROM %I', r);
    END IF;
  END LOOP;
END $rev2$;
GRANT EXECUTE ON FUNCTION internal_shipping.resolve_final_eta(uuid,uuid,timestamptz) TO postgres;

DO $assert$
BEGIN
  IF (SELECT proacl FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='internal_shipping' AND p.proname='resolve_final_eta') IS NULL THEN
    RAISE EXCEPTION 'M1C-1D-G: resolver proacl must not be NULL';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='internal_shipping') <> 0 THEN
    RAISE EXCEPTION 'M1C-1D-G: internal_shipping must contain no relations';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) r(x)
             WHERE has_schema_privilege(r.x,'internal_shipping','USAGE')) THEN
    RAISE EXCEPTION 'M1C-1D-G: non-owner role retains USAGE on internal_shipping';
  END IF;
END $assert$;