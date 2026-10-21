
-- =============================================================================
-- SECURITY FIX: profiles readable only by owner
-- =============================================================================
DROP POLICY IF EXISTS "profiles readable by everyone" ON public.profiles;
CREATE POLICY "users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- =============================================================================
-- CONFIG: p4_live_authorization_enabled (default false)
-- =============================================================================
DO $$ BEGIN
  PERFORM set_config('app.p4_live_authorization_enabled', 'false', false);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =============================================================================
-- ALTER channel_connections: live_authorized_at
-- =============================================================================
ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS live_authorized_at timestamptz;

-- =============================================================================
-- authorize_channel_live (service_role, gated by GUC)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.authorize_channel_live(
  _company_id uuid, _channel_account_id uuid, _note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _flag text;
BEGIN
  _flag := current_setting('app.p4_live_authorization_enabled', true);
  IF _flag IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'live authorization disabled by P4_LIVE_AUTHORIZATION_ENABLED' USING ERRCODE = 'P0403';
  END IF;
  UPDATE public.channel_connections
    SET live_authorized_at = COALESCE(live_authorized_at, now()), updated_at = now()
    WHERE company_id = _company_id AND channel_account_id = _channel_account_id;
END $$;
REVOKE ALL ON FUNCTION public.authorize_channel_live(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_channel_live(uuid,uuid,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_channel_live(uuid,uuid,text) TO service_role;

-- =============================================================================
-- p4_dispatch_decision: live requires live_authorized_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.p4_dispatch_decision(_channel_account_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _c public.channel_connections%ROWTYPE; _g boolean; _s boolean;
BEGIN
  SELECT * INTO _c FROM public.channel_connections
    WHERE channel_account_id = _channel_account_id AND provider = 'bol'
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'blocked_no_connection'; END IF;
  IF _c.mode = 'disabled'  THEN RETURN 'blocked_disabled'; END IF;
  IF _c.mode = 'read_only' THEN RETURN 'blocked_read_only'; END IF;

  SELECT writes_disabled INTO _g FROM public.channel_kill_switches
    WHERE scope = 'global' AND connection_id IS NULL;
  IF COALESCE(_g, FALSE) THEN RETURN 'blocked_kill_switch'; END IF;

  SELECT writes_disabled INTO _s FROM public.channel_kill_switches
    WHERE scope = 'connection' AND connection_id = _c.id;
  IF COALESCE(_s, FALSE) THEN RETURN 'blocked_kill_switch'; END IF;

  IF _c.mode = 'live' AND _c.live_sync_enabled = TRUE THEN
    IF _c.live_authorized_at IS NULL
       OR current_setting('app.p4_live_authorization_enabled', true) IS DISTINCT FROM 'true'
    THEN
      RETURN 'deferred_not_authorized';
    END IF;
    RETURN 'live';
  END IF;
  RETURN 'shadow';
END $$;

-- =============================================================================
-- channel_shipments
-- =============================================================================
CREATE TABLE public.channel_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  channel_order_line_id uuid NOT NULL REFERENCES public.channel_order_lines(id) ON DELETE RESTRICT,
  allocation_id uuid NOT NULL REFERENCES public.inventory_reservation_allocations(id) ON DELETE RESTRICT,
  transporter_code text NOT NULL CHECK (length(btrim(transporter_code)) > 0),
  track_and_trace text,
  bol_shipment_id text,
  bol_process_status_id text,
  status text NOT NULL DEFAULT 'draft',
  last_error text,
  shipped_at timestamptz,
  bol_confirmed_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_shipments_status_ck CHECK (status IN
    ('draft','pending_bol_confirmation','bol_confirmed','delivered','returned','cancelled'))
);
CREATE INDEX channel_shipments_company_idx ON public.channel_shipments (company_id, created_at DESC);
CREATE INDEX channel_shipments_order_line_idx ON public.channel_shipments (channel_order_line_id);
CREATE UNIQUE INDEX channel_shipments_one_per_line ON public.channel_shipments (channel_order_line_id)
  WHERE status <> 'cancelled';

-- Tenant coherence: shipment's (company_id, channel_account_id) must match order line's
CREATE OR REPLACE FUNCTION public.channel_shipments_tenant_ck()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _c uuid; _a uuid;
BEGIN
  SELECT company_id, channel_account_id INTO _c, _a
    FROM public.channel_order_lines WHERE id = NEW.channel_order_line_id;
  IF _c IS DISTINCT FROM NEW.company_id OR _a IS DISTINCT FROM NEW.channel_account_id THEN
    RAISE EXCEPTION 'tenant mismatch: shipment (company=%,account=%) vs order line (company=%,account=%)',
      NEW.company_id, NEW.channel_account_id, _c, _a USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channel_shipments_tenant_ck_t
  BEFORE INSERT OR UPDATE ON public.channel_shipments
  FOR EACH ROW EXECUTE FUNCTION public.channel_shipments_tenant_ck();

CREATE OR REPLACE FUNCTION public.touch_updated_at_m5()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER channel_shipments_touch BEFORE UPDATE ON public.channel_shipments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_m5();

GRANT SELECT ON public.channel_shipments TO authenticated;
GRANT ALL ON public.channel_shipments TO service_role;
ALTER TABLE public.channel_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own shipments" ON public.channel_shipments FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

-- =============================================================================
-- channel_shipment_events (append-only)
-- =============================================================================
CREATE TABLE public.channel_shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.channel_shipments(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  source text NOT NULL CHECK (source IN ('worker','inbound_sync','operator','rpc')),
  event_time timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channel_shipment_events_shipment_idx ON public.channel_shipment_events (shipment_id, event_time);
CREATE INDEX channel_shipment_events_company_idx ON public.channel_shipment_events (company_id, event_time DESC);

GRANT SELECT ON public.channel_shipment_events TO authenticated;
GRANT ALL ON public.channel_shipment_events TO service_role;
ALTER TABLE public.channel_shipment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own shipment events" ON public.channel_shipment_events FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.channel_shipment_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'channel_shipment_events is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER channel_shipment_events_no_update BEFORE UPDATE ON public.channel_shipment_events
  FOR EACH ROW EXECUTE FUNCTION public.channel_shipment_events_append_only();
CREATE TRIGGER channel_shipment_events_no_delete BEFORE DELETE ON public.channel_shipment_events
  FOR EACH ROW EXECUTE FUNCTION public.channel_shipment_events_append_only();

-- =============================================================================
-- shipment_outbox_events (independent stream)
-- =============================================================================
CREATE TABLE public.shipment_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  channel_account_id uuid NOT NULL,
  channel_shipment_id uuid NOT NULL REFERENCES public.channel_shipments(id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK (event_kind IN ('bol.shipment.confirm')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_flight','succeeded','failed','dead')),
  attempt_count int NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts int NOT NULL DEFAULT 8 CHECK (max_attempts >= 1),
  next_visible_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  external_ref jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sh_outbox_in_flight_shape_ck CHECK (
    status = 'in_flight' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
    OR status <> 'in_flight'
  )
);
-- Idempotency: one row per (company, account, shipment, event_kind)
CREATE UNIQUE INDEX shipment_outbox_events_idem
  ON public.shipment_outbox_events (company_id, channel_account_id, channel_shipment_id, event_kind);
-- One-in-flight on the same tuple
CREATE UNIQUE INDEX shipment_outbox_events_one_in_flight
  ON public.shipment_outbox_events (company_id, channel_account_id, channel_shipment_id, event_kind)
  WHERE status = 'in_flight';
CREATE INDEX shipment_outbox_events_dispatch_idx
  ON public.shipment_outbox_events (channel_account_id, next_visible_at, created_at)
  WHERE status IN ('pending','failed');

GRANT SELECT ON public.shipment_outbox_events TO authenticated;
GRANT ALL ON public.shipment_outbox_events TO service_role;
ALTER TABLE public.shipment_outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own shipment outbox" ON public.shipment_outbox_events FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE TRIGGER shipment_outbox_events_touch BEFORE UPDATE ON public.shipment_outbox_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_m5();

-- =============================================================================
-- shipment_outbox_dead_letters
-- =============================================================================
CREATE TABLE public.shipment_outbox_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NOT NULL,
  company_id uuid NOT NULL,
  channel_account_id uuid NOT NULL,
  channel_shipment_id uuid NOT NULL,
  event_kind text NOT NULL,
  payload jsonb NOT NULL,
  attempts int NOT NULL,
  last_error text,
  moved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipment_outbox_dlq_company_idx ON public.shipment_outbox_dead_letters (company_id, moved_at DESC);
GRANT SELECT ON public.shipment_outbox_dead_letters TO authenticated;
GRANT ALL ON public.shipment_outbox_dead_letters TO service_role;
ALTER TABLE public.shipment_outbox_dead_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own shipment dlq" ON public.shipment_outbox_dead_letters FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

-- =============================================================================
-- record_internal_ship_and_enqueue_confirmation (§6.1)
-- Atomic: post inventory ship + mark allocation shipped + create shipment
--         + enqueue outbox confirm. Idempotent by (company, order_line, allocation).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_internal_ship_and_enqueue_confirmation(
  _company_id uuid,
  _channel_account_id uuid,
  _channel_order_line_id uuid,
  _allocation_id uuid,
  _transporter_code text,
  _track_and_trace text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _line public.channel_order_lines%ROWTYPE;
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _rline public.inventory_reservation_lines%ROWTYPE;
  _rhdr  public.inventory_reservation_headers%ROWTYPE;
  _shippable int;
  _idem text;
  _existing_shipment uuid;
  _shipment_id uuid;
  _entries jsonb;
  _tx jsonb;
  _tx_id uuid;
  _outbox_id uuid;
BEGIN
  -- Tenant + order line
  SELECT * INTO _line FROM public.channel_order_lines
    WHERE id = _channel_order_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order line not found' USING ERRCODE='P0002'; END IF;
  IF _line.company_id <> _company_id OR _line.channel_account_id <> _channel_account_id THEN
    RAISE EXCEPTION 'tenant mismatch on order line' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _alloc FROM public.inventory_reservation_allocations
    WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO _rline FROM public.inventory_reservation_lines WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _rhdr  FROM public.inventory_reservation_headers WHERE id = _rline.reservation_id FOR UPDATE;
  IF _rhdr.company_id <> _company_id THEN
    RAISE EXCEPTION 'tenant mismatch on allocation' USING ERRCODE='42501';
  END IF;

  -- Idempotency lookup: same (company, order_line, allocation)
  SELECT id INTO _existing_shipment FROM public.channel_shipments
    WHERE company_id = _company_id
      AND channel_order_line_id = _channel_order_line_id
      AND allocation_id = _allocation_id
      AND status <> 'cancelled'
    LIMIT 1;

  IF _existing_shipment IS NOT NULL THEN
    -- No-op replay
    RETURN jsonb_build_object('ok', true, 'idempotent_replay', true,
      'shipment_id', _existing_shipment);
  END IF;

  -- Verify shippable = packed - shipped >= 1
  _shippable := _alloc.packed_quantity - _alloc.shipped_quantity;
  IF _shippable < 1 THEN
    RAISE EXCEPTION 'allocation has no shippable quantity (packed=%,shipped=%)',
      _alloc.packed_quantity, _alloc.shipped_quantity USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('m5-ship:' || _company_id::text || ':' || _rline.sku_id::text, 0));

  -- Idempotency key so post_inventory_transaction is safe under replay
  _idem := 'm5-ship:' || _channel_order_line_id::text || ':' || _allocation_id::text;

  _entries := jsonb_build_array(jsonb_build_object(
    'sku_id', _rline.sku_id,
    'warehouse_id', _alloc.warehouse_id,
    'location_id', _alloc.location_id,
    'disposition', 'packed_or_staging',
    'lot_id', NULL, 'serial_id', NULL,
    'quantity', -1
  ));

  _tx := public.post_inventory_transaction(
    _company_id, 'ship', _entries,
    'channel_shipment', NULL, _idem,
    jsonb_build_object('order_line_id', _channel_order_line_id, 'allocation_id', _allocation_id,
                       'carrier', _transporter_code, 'tracking_code', _track_and_trace),
    NULL);

  _tx_id := (_tx->>'transaction_id')::uuid;

  -- Advance allocation counters only on first (non-replay) call
  IF NOT COALESCE((_tx->>'idempotent_replay')::boolean, false) THEN
    UPDATE public.inventory_reservation_allocations
      SET shipped_quantity = shipped_quantity + 1, updated_at = now() WHERE id = _alloc.id;
    UPDATE public.inventory_reservation_lines
      SET shipped_quantity = shipped_quantity + 1, updated_at = now() WHERE id = _rline.id;
  END IF;

  -- Create shipment
  INSERT INTO public.channel_shipments (
    company_id, channel_account_id, channel_order_line_id, allocation_id,
    transporter_code, track_and_trace, status, shipped_at
  ) VALUES (
    _company_id, _channel_account_id, _channel_order_line_id, _allocation_id,
    _transporter_code, _track_and_trace, 'pending_bol_confirmation', now()
  ) RETURNING id INTO _shipment_id;

  INSERT INTO public.channel_shipment_events (
    shipment_id, company_id, from_status, to_status, source, metadata
  ) VALUES (
    _shipment_id, _company_id, 'draft', 'pending_bol_confirmation', 'rpc',
    jsonb_build_object('carrier', _transporter_code, 'inventory_transaction_id', _tx_id)
  );

  -- Enqueue outbox confirmation
  INSERT INTO public.shipment_outbox_events (
    company_id, channel_account_id, channel_shipment_id, event_kind, payload
  ) VALUES (
    _company_id, _channel_account_id, _shipment_id, 'bol.shipment.confirm',
    jsonb_build_object('order_line_id', _channel_order_line_id,
                       'transporter_code', _transporter_code,
                       'track_and_trace', _track_and_trace)
  ) RETURNING id INTO _outbox_id;

  RETURN jsonb_build_object('ok', true, 'idempotent_replay', false,
    'shipment_id', _shipment_id, 'outbox_event_id', _outbox_id,
    'inventory_transaction_id', _tx_id);
END $$;

REVOKE ALL ON FUNCTION public.record_internal_ship_and_enqueue_confirmation(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_internal_ship_and_enqueue_confirmation(uuid,uuid,uuid,uuid,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_internal_ship_and_enqueue_confirmation(uuid,uuid,uuid,uuid,text,text) TO service_role;

-- =============================================================================
-- Worker feedback RPCs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_channel_shipment_accepted(
  _shipment_id uuid, _process_status_id text, _bol_shipment_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.channel_shipments
    SET bol_process_status_id = _process_status_id,
        bol_shipment_id = COALESCE(_bol_shipment_id, bol_shipment_id),
        last_error = NULL, updated_at = now()
    WHERE id = _shipment_id;
END $$;
REVOKE ALL ON FUNCTION public.record_channel_shipment_accepted(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_channel_shipment_accepted(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_channel_shipment_bol_confirmed(
  _shipment_id uuid, _external_ref jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _s public.channel_shipments%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.channel_shipments WHERE id = _shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'shipment not found' USING ERRCODE='P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('m5-confirm:' || _s.company_id::text || ':' || _s.channel_order_line_id::text, 0));
  IF _s.status = 'bol_confirmed' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_replay', true);
  END IF;
  IF _s.status <> 'pending_bol_confirmation' THEN
    RAISE EXCEPTION 'invalid transition from % to bol_confirmed', _s.status USING ERRCODE='P0001';
  END IF;
  UPDATE public.channel_shipments
    SET status = 'bol_confirmed', bol_confirmed_at = now(), last_error = NULL, updated_at = now()
    WHERE id = _shipment_id;
  INSERT INTO public.channel_shipment_events (shipment_id, company_id, from_status, to_status, source, metadata)
    VALUES (_shipment_id, _s.company_id, 'pending_bol_confirmation', 'bol_confirmed', 'worker', _external_ref);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.record_channel_shipment_bol_confirmed(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_channel_shipment_bol_confirmed(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_channel_shipment_bol_failure(
  _shipment_id uuid, _error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Non-reversal: status stays pending_bol_confirmation; only last_error stored.
  UPDATE public.channel_shipments
    SET last_error = _error, updated_at = now()
    WHERE id = _shipment_id AND status = 'pending_bol_confirmation';
END $$;
REVOKE ALL ON FUNCTION public.record_channel_shipment_bol_failure(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_channel_shipment_bol_failure(uuid,text) TO service_role;

-- =============================================================================
-- ingest_bol_shipment_status (delivered / returned)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ingest_bol_shipment_status(
  _company_id uuid, _channel_account_id uuid,
  _bol_shipment_id text, _status text, _event_time timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _s public.channel_shipments%ROWTYPE;
BEGIN
  IF _status NOT IN ('delivered','returned') THEN
    RAISE EXCEPTION 'invalid inbound status %', _status USING ERRCODE='P0001';
  END IF;
  SELECT * INTO _s FROM public.channel_shipments
    WHERE company_id = _company_id AND channel_account_id = _channel_account_id
      AND bol_shipment_id = _bol_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'shipment not found' USING ERRCODE='P0002'; END IF;

  -- Idempotency: identical event already exists?
  IF EXISTS (
    SELECT 1 FROM public.channel_shipment_events
    WHERE shipment_id = _s.id AND to_status = _status
      AND event_time = _event_time AND source = 'inbound_sync'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_replay', true);
  END IF;
  IF _s.status = _status THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_replay', true);
  END IF;
  IF _s.status NOT IN ('bol_confirmed','delivered') THEN
    RAISE EXCEPTION 'cannot transition from % to %', _s.status, _status USING ERRCODE='P0001';
  END IF;

  UPDATE public.channel_shipments
    SET status = _status,
        terminal_at = CASE WHEN _status IN ('delivered','returned') THEN now() ELSE terminal_at END,
        updated_at = now()
    WHERE id = _s.id;
  INSERT INTO public.channel_shipment_events (shipment_id, company_id, from_status, to_status, source, event_time, metadata)
    VALUES (_s.id, _s.company_id, _s.status, _status, 'inbound_sync', _event_time, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.ingest_bol_shipment_status(uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_bol_shipment_status(uuid,uuid,text,text,timestamptz) TO service_role;

-- =============================================================================
-- Shipment outbox lifecycle RPCs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.claim_shipment_outbox_batch(
  _worker_id text, _lease_ttl_seconds int, _batch_size int
) RETURNS SETOF public.shipment_outbox_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.shipment_outbox_events
      WHERE status IN ('pending','failed')
        AND next_visible_at <= now()
      ORDER BY next_visible_at, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT _batch_size
  ),
  claimed AS (
    UPDATE public.shipment_outbox_events e
       SET status = 'in_flight',
           lease_owner = _worker_id,
           lease_expires_at = now() + make_interval(secs => _lease_ttl_seconds),
           attempt_count = attempt_count + 1,
           updated_at = now()
      FROM candidates c
     WHERE e.id = c.id
     RETURNING e.*
  )
  SELECT * FROM claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_shipment_outbox_batch(text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipment_outbox_batch(text,int,int) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_shipment_outbox_event(
  _event_id uuid, _external_ref jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.shipment_outbox_events
    SET status = 'succeeded', external_ref = _external_ref,
        lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = now()
    WHERE id = _event_id;
END $$;
REVOKE ALL ON FUNCTION public.complete_shipment_outbox_event(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shipment_outbox_event(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_shipment_outbox_event(
  _event_id uuid, _error text, _transient boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _e public.shipment_outbox_events%ROWTYPE; _delay int;
BEGIN
  SELECT * INTO _e FROM public.shipment_outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found' USING ERRCODE='P0002'; END IF;

  IF NOT _transient OR _e.attempt_count >= _e.max_attempts THEN
    -- Dead-letter
    INSERT INTO public.shipment_outbox_dead_letters (
      original_event_id, company_id, channel_account_id, channel_shipment_id,
      event_kind, payload, attempts, last_error
    ) VALUES (
      _e.id, _e.company_id, _e.channel_account_id, _e.channel_shipment_id,
      _e.event_kind, _e.payload, _e.attempt_count, _error
    );
    UPDATE public.shipment_outbox_events
      SET status = 'dead', last_error = _error,
          lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE id = _event_id;
    RETURN jsonb_build_object('ok', true, 'dead_lettered', true);
  END IF;

  -- Exponential backoff: 2^attempt seconds, capped at 3600
  _delay := LEAST(3600, POWER(2, _e.attempt_count)::int);
  UPDATE public.shipment_outbox_events
    SET status = 'failed', last_error = _error,
        next_visible_at = now() + make_interval(secs => _delay),
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = _event_id;
  RETURN jsonb_build_object('ok', true, 'dead_lettered', false, 'retry_in_seconds', _delay);
END $$;
REVOKE ALL ON FUNCTION public.fail_shipment_outbox_event(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_shipment_outbox_event(uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_expired_shipment_leases()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _n int;
BEGIN
  WITH expired AS (
    UPDATE public.shipment_outbox_events
      SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
          last_error = COALESCE(last_error, '') || ' [lease expired]',
          next_visible_at = now(), updated_at = now()
      WHERE status = 'in_flight' AND lease_expires_at < now()
      RETURNING 1
  )
  SELECT count(*) INTO _n FROM expired;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.recover_expired_shipment_leases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_expired_shipment_leases() TO service_role;
