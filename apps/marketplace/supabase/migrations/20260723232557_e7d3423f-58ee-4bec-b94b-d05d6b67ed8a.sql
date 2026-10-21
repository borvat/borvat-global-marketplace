-- =========================================================================
-- Phase 4 — Migration 4: Bol outbound via Phase 3 outbox (shadow + live)
-- Charter: writes are strictly gated (blocked / shadow / live). Kill switch
-- defers pending events without consuming attempts. Import + internal
-- inventory are untouched.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Shadow + Live dispatch log tables
-- -------------------------------------------------------------------------
CREATE TABLE public.channel_shadow_dispatches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid NOT NULL UNIQUE REFERENCES public.outbox_events(id) ON DELETE RESTRICT,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  connection_id      uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE RESTRICT,
  listing_id         uuid NOT NULL REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  listing_version    bigint NOT NULL,
  event_type         text NOT NULL,
  payload            jsonb NOT NULL,
  connection_mode    public.p4_connection_mode NOT NULL,
  reason_code        text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shadow_dispatches_company_idx ON public.channel_shadow_dispatches(company_id, created_at DESC);
CREATE INDEX shadow_dispatches_listing_idx ON public.channel_shadow_dispatches(listing_id, listing_version DESC);

GRANT SELECT ON public.channel_shadow_dispatches TO authenticated;
GRANT ALL    ON public.channel_shadow_dispatches TO service_role;
ALTER TABLE public.channel_shadow_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shadow_read_own_company"
  ON public.channel_shadow_dispatches FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE TABLE public.channel_live_dispatches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid NOT NULL UNIQUE REFERENCES public.outbox_events(id) ON DELETE RESTRICT,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id    uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  connection_id         uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE RESTRICT,
  listing_id            uuid NOT NULL REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  listing_version       bigint NOT NULL,
  event_type            text NOT NULL,
  payload               jsonb NOT NULL,
  http_status           int NOT NULL,
  bol_process_status_id text,
  external_ref          jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_started_at    timestamptz NOT NULL,
  request_ended_at      timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_dispatches_http_ck CHECK (http_status BETWEEN 100 AND 599)
);
CREATE INDEX live_dispatches_company_idx ON public.channel_live_dispatches(company_id, created_at DESC);
CREATE INDEX live_dispatches_listing_idx ON public.channel_live_dispatches(listing_id, listing_version DESC);

GRANT SELECT ON public.channel_live_dispatches TO authenticated;
GRANT ALL    ON public.channel_live_dispatches TO service_role;
ALTER TABLE public.channel_live_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_read_own_company"
  ON public.channel_live_dispatches FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

-- -------------------------------------------------------------------------
-- 2. Dispatch decision helper (service_role only)
-- -------------------------------------------------------------------------
-- Returns one of:
--   'blocked_no_connection', 'blocked_disabled', 'blocked_read_only',
--   'blocked_kill_switch', 'shadow', 'live'
CREATE OR REPLACE FUNCTION public.p4_dispatch_decision(_channel_account_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _c public.channel_connections%ROWTYPE;
  _g boolean; _s boolean;
BEGIN
  SELECT * INTO _c FROM public.channel_connections
    WHERE channel_account_id = _channel_account_id AND provider = 'bol'
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'blocked_no_connection'; END IF;

  IF _c.mode = 'disabled'  THEN RETURN 'blocked_disabled';  END IF;
  IF _c.mode = 'read_only' THEN RETURN 'blocked_read_only'; END IF;

  SELECT writes_disabled INTO _g FROM public.channel_kill_switches
    WHERE scope = 'global' AND connection_id IS NULL;
  IF COALESCE(_g, FALSE) THEN RETURN 'blocked_kill_switch'; END IF;

  SELECT writes_disabled INTO _s FROM public.channel_kill_switches
    WHERE scope = 'connection' AND connection_id = _c.id;
  IF COALESCE(_s, FALSE) THEN RETURN 'blocked_kill_switch'; END IF;

  IF _c.mode = 'live' AND _c.live_sync_enabled = TRUE THEN RETURN 'live'; END IF;
  RETURN 'shadow';
END $$;
REVOKE ALL ON FUNCTION public.p4_dispatch_decision(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p4_dispatch_decision(uuid) TO service_role;

-- -------------------------------------------------------------------------
-- 3. Internal enqueue helper (SECURITY DEFINER, not directly callable)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._p4_enqueue_bol_write(
  _listing_id uuid,
  _event_type text,
  _payload jsonb,
  _expected_version bigint,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _actor uuid := auth.uid();
  _l public.channel_listings%ROWTYPE;
  _c public.channel_connections%ROWTYPE;
  _new_version bigint;
  _event_id uuid;
  _final_payload jsonb;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _event_type IS NULL OR length(btrim(_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  SELECT * INTO _l FROM public.channel_listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;

  IF NOT public.company_member_has_permission(_l.company_id, _actor, 'listings.manage') THEN
    RAISE EXCEPTION 'permission listings.manage required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _c FROM public.channel_connections
    WHERE channel_account_id = _l.channel_account_id AND provider = 'bol'
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no bol connection for channel account' USING ERRCODE = 'P0001';
  END IF;

  IF _c.mode = 'disabled'  THEN RAISE EXCEPTION 'bol connection disabled'  USING ERRCODE = 'P0001'; END IF;
  IF _c.mode = 'read_only' THEN RAISE EXCEPTION 'bol connection is read_only; writes not permitted' USING ERRCODE = 'P0001'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chpub:' || _l.id::text, 0));

  IF _expected_version IS NOT NULL AND _expected_version <> _l.published_version THEN
    RAISE EXCEPTION 'version conflict: expected %, current %',
      _expected_version, _l.published_version USING ERRCODE = 'P0001';
  END IF;

  _new_version := _l.published_version + 1;
  UPDATE public.channel_listings
     SET published_version = _new_version,
         updated_at        = now()
   WHERE id = _l.id;

  _final_payload := COALESCE(_payload,'{}'::jsonb) || jsonb_build_object(
    'reason',       _reason,
    'from_version', _l.published_version,
    'to_version',   _new_version,
    'connection_mode', _c.mode
  );

  _event_id := public.enqueue_outbox_event(_l.id, _new_version, _event_type, _final_payload);

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', _event_id,
    'listing_id', _l.id,
    'event_type', _event_type,
    'listing_version', _new_version,
    'connection_mode', _c.mode
  );
END $$;
REVOKE ALL ON FUNCTION public._p4_enqueue_bol_write(uuid,text,jsonb,bigint,text) FROM PUBLIC, anon, authenticated;
-- Only wrappers below invoke it; service_role can call for maintenance.
GRANT EXECUTE ON FUNCTION public._p4_enqueue_bol_write(uuid,text,jsonb,bigint,text) TO service_role;

-- -------------------------------------------------------------------------
-- 4. Public enqueue wrappers (authenticated)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bol_enqueue_offer_stock_set(
  _listing_id uuid, _quantity int, _reason text, _expected_version bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _quantity IS NULL OR _quantity < 0 THEN RAISE EXCEPTION 'quantity must be >= 0'; END IF;
  RETURN public._p4_enqueue_bol_write(
    _listing_id, 'bol.offer.stock.set',
    jsonb_build_object('quantity', _quantity),
    _expected_version, _reason
  );
END $$;
REVOKE ALL ON FUNCTION public.bol_enqueue_offer_stock_set(uuid,int,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bol_enqueue_offer_stock_set(uuid,int,text,bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bol_enqueue_offer_price_set(
  _listing_id uuid, _price_cents int, _currency text, _reason text, _expected_version bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _price_cents IS NULL OR _price_cents <= 0 THEN RAISE EXCEPTION 'price_cents must be > 0'; END IF;
  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'currency must be ISO-4217 3-letter code'; END IF;
  RETURN public._p4_enqueue_bol_write(
    _listing_id, 'bol.offer.price.set',
    jsonb_build_object('price_cents', _price_cents, 'currency', _currency),
    _expected_version, _reason
  );
END $$;
REVOKE ALL ON FUNCTION public.bol_enqueue_offer_price_set(uuid,int,text,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bol_enqueue_offer_price_set(uuid,int,text,text,bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bol_enqueue_offer_fulfilment_set(
  _listing_id uuid, _method text, _reason text, _expected_version bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _method IS NULL OR _method <> 'FBR' THEN
    RAISE EXCEPTION 'phase 4 only supports FBR fulfilment (got %)', _method USING ERRCODE = 'P0001';
  END IF;
  RETURN public._p4_enqueue_bol_write(
    _listing_id, 'bol.offer.fulfilment.set',
    jsonb_build_object('method', _method),
    _expected_version, _reason
  );
END $$;
REVOKE ALL ON FUNCTION public.bol_enqueue_offer_fulfilment_set(uuid,text,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bol_enqueue_offer_fulfilment_set(uuid,text,text,bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bol_enqueue_offer_delivery_promise_set(
  _listing_id uuid, _promise jsonb, _reason text, _expected_version bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _promise IS NULL OR jsonb_typeof(_promise) <> 'object' THEN
    RAISE EXCEPTION 'promise must be a jsonb object';
  END IF;
  RETURN public._p4_enqueue_bol_write(
    _listing_id, 'bol.offer.delivery_promise.set',
    jsonb_build_object('promise', _promise),
    _expected_version, _reason
  );
END $$;
REVOKE ALL ON FUNCTION public.bol_enqueue_offer_delivery_promise_set(uuid,jsonb,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bol_enqueue_offer_delivery_promise_set(uuid,jsonb,text,bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bol_enqueue_offer_resync(
  _listing_id uuid, _reason text, _expected_version bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN public._p4_enqueue_bol_write(
    _listing_id, 'bol.offer.resync',
    '{}'::jsonb,
    _expected_version, _reason
  );
END $$;
REVOKE ALL ON FUNCTION public.bol_enqueue_offer_resync(uuid,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bol_enqueue_offer_resync(uuid,text,bigint) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 5. Completion RPCs — enforce mode server-side
-- -------------------------------------------------------------------------
-- Shadow: only if dispatch decision is 'shadow'. Live is refused so the
-- worker MUST call the live path (fail-closed).
CREATE OR REPLACE FUNCTION public.complete_outbox_event_shadow(
  _event_id uuid, _claim_token uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _e public.outbox_events%ROWTYPE;
  _c public.channel_connections%ROWTYPE;
  _decision text;
BEGIN
  IF _event_id IS NULL OR _claim_token IS NULL THEN
    RAISE EXCEPTION 'event_id and claim_token required';
  END IF;

  SELECT * INTO _e FROM public.outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF _e.status <> 'in_flight' THEN
    RAISE EXCEPTION 'event % not in_flight (status=%)', _event_id, _e.status;
  END IF;
  IF _e.claim_token <> _claim_token THEN
    RAISE EXCEPTION 'claim_token mismatch for event %', _event_id;
  END IF;

  _decision := public.p4_dispatch_decision(_e.channel_account_id);
  IF _decision <> 'shadow' THEN
    RAISE EXCEPTION 'shadow completion refused: dispatch decision is %', _decision USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _c FROM public.channel_connections
    WHERE channel_account_id = _e.channel_account_id AND provider='bol'
    ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.channel_shadow_dispatches
    (event_id, company_id, channel_account_id, connection_id, listing_id,
     listing_version, event_type, payload, connection_mode, reason_code)
  VALUES
    (_e.id, _e.company_id, _e.channel_account_id, _c.id, _e.listing_id,
     _e.listing_version, _e.event_type, _e.payload, _c.mode,
     CASE WHEN _c.mode = 'live' THEN 'live_sync_disabled' ELSE 'shadow_mode' END);

  UPDATE public.outbox_events
     SET status = 'delivered',
         delivered_at = now(),
         attempts = attempts + 1,
         claim_token = NULL,
         claimed_at = NULL,
         lease_expires_at = NULL,
         last_error = NULL
   WHERE id = _e.id;

  -- Supersede lower-version pending/failed siblings for same target
  UPDATE public.outbox_events
     SET status = 'superseded'
   WHERE company_id = _e.company_id
     AND channel_account_id = _e.channel_account_id
     AND COALESCE(sku_id, offer_id) = COALESCE(_e.sku_id, _e.offer_id)
     AND status IN ('pending','failed')
     AND listing_version < _e.listing_version;

  RETURN jsonb_build_object('ok', true, 'mode', 'shadow', 'event_id', _e.id);
END $$;
REVOKE ALL ON FUNCTION public.complete_outbox_event_shadow(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_outbox_event_shadow(uuid,uuid) TO service_role;

-- Live: only when dispatch decision is 'live' at write time. Fail-closed.
CREATE OR REPLACE FUNCTION public.complete_outbox_event_live(
  _event_id uuid,
  _claim_token uuid,
  _http_status int,
  _external_ref jsonb DEFAULT '{}'::jsonb,
  _bol_process_status_id text DEFAULT NULL,
  _request_started_at timestamptz DEFAULT NULL,
  _request_ended_at   timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _e public.outbox_events%ROWTYPE;
  _c public.channel_connections%ROWTYPE;
  _decision text;
  _started timestamptz := COALESCE(_request_started_at, now());
  _ended   timestamptz := COALESCE(_request_ended_at,   now());
BEGIN
  IF _event_id IS NULL OR _claim_token IS NULL THEN
    RAISE EXCEPTION 'event_id and claim_token required';
  END IF;
  IF _http_status IS NULL OR _http_status < 100 OR _http_status > 599 THEN
    RAISE EXCEPTION 'http_status invalid';
  END IF;
  IF _http_status >= 400 THEN
    RAISE EXCEPTION 'live completion requires success http_status (got %); use fail_outbox_event instead', _http_status;
  END IF;

  SELECT * INTO _e FROM public.outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF _e.status <> 'in_flight' THEN
    RAISE EXCEPTION 'event % not in_flight (status=%)', _event_id, _e.status;
  END IF;
  IF _e.claim_token <> _claim_token THEN
    RAISE EXCEPTION 'claim_token mismatch for event %', _event_id;
  END IF;

  _decision := public.p4_dispatch_decision(_e.channel_account_id);
  IF _decision <> 'live' THEN
    RAISE EXCEPTION 'live completion refused: dispatch decision is %', _decision USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _c FROM public.channel_connections
    WHERE channel_account_id = _e.channel_account_id AND provider='bol'
    ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.channel_live_dispatches
    (event_id, company_id, channel_account_id, connection_id, listing_id,
     listing_version, event_type, payload, http_status, bol_process_status_id,
     external_ref, request_started_at, request_ended_at)
  VALUES
    (_e.id, _e.company_id, _e.channel_account_id, _c.id, _e.listing_id,
     _e.listing_version, _e.event_type, _e.payload, _http_status, _bol_process_status_id,
     COALESCE(_external_ref,'{}'::jsonb), _started, _ended);

  UPDATE public.outbox_events
     SET status = 'delivered',
         delivered_at = now(),
         attempts = attempts + 1,
         claim_token = NULL,
         claimed_at = NULL,
         lease_expires_at = NULL,
         last_error = NULL
   WHERE id = _e.id;

  UPDATE public.outbox_events
     SET status = 'superseded'
   WHERE company_id = _e.company_id
     AND channel_account_id = _e.channel_account_id
     AND COALESCE(sku_id, offer_id) = COALESCE(_e.sku_id, _e.offer_id)
     AND status IN ('pending','failed')
     AND listing_version < _e.listing_version;

  RETURN jsonb_build_object('ok', true, 'mode', 'live', 'event_id', _e.id, 'http_status', _http_status);
END $$;
REVOKE ALL ON FUNCTION public.complete_outbox_event_live(uuid,uuid,int,jsonb,text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_outbox_event_live(uuid,uuid,int,jsonb,text,timestamptz,timestamptz) TO service_role;

-- Defer: unclaims a killed-switch event WITHOUT consuming attempts.
CREATE OR REPLACE FUNCTION public.defer_outbox_event_kill_switch(
  _event_id uuid, _claim_token uuid, _reason text DEFAULT 'kill_switch_active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _e public.outbox_events%ROWTYPE;
  _decision text;
BEGIN
  IF _event_id IS NULL OR _claim_token IS NULL THEN
    RAISE EXCEPTION 'event_id and claim_token required';
  END IF;

  SELECT * INTO _e FROM public.outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF _e.status <> 'in_flight' THEN
    RAISE EXCEPTION 'event % not in_flight (status=%)', _event_id, _e.status;
  END IF;
  IF _e.claim_token <> _claim_token THEN
    RAISE EXCEPTION 'claim_token mismatch for event %', _event_id;
  END IF;

  _decision := public.p4_dispatch_decision(_e.channel_account_id);
  IF _decision NOT IN ('blocked_kill_switch','blocked_disabled','blocked_read_only','blocked_no_connection') THEN
    RAISE EXCEPTION 'defer refused: dispatch decision is % (writes are permitted)', _decision USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.outbox_events
     SET status = 'pending',
         claim_token = NULL,
         claimed_at = NULL,
         lease_expires_at = NULL,
         next_attempt_at = now() + interval '30 seconds',
         last_error = _reason
   WHERE id = _e.id;

  RETURN jsonb_build_object('ok', true, 'event_id', _e.id, 'decision', _decision, 'deferred_until', now() + interval '30 seconds');
END $$;
REVOKE ALL ON FUNCTION public.defer_outbox_event_kill_switch(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_outbox_event_kill_switch(uuid,uuid,text) TO service_role;
