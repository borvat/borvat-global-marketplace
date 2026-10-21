
-- =============================================================================
-- Phase 4 — Migration 3: Bol Orders + Exception Queue
-- =============================================================================

-- Enums --------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='p4_order_status') THEN
    CREATE TYPE public.p4_order_status AS ENUM ('open','partially_shipped','shipped','partially_cancelled','cancelled','mixed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='p4_order_line_status') THEN
    CREATE TYPE public.p4_order_line_status AS ENUM (
      'exception_offer_not_linked',
      'exception_fbb',
      'pending_reservation',
      'reserved',
      'shipped',
      'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='p4_fulfilment_method') THEN
    CREATE TYPE public.p4_fulfilment_method AS ENUM ('FBR','FBB');
  END IF;
END $$;

-- Tables -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_order_inbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id  uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  provider            text NOT NULL CHECK (provider='bol'),
  bol_order_id        text NOT NULL,
  raw_payload         jsonb NOT NULL,
  observed_at         timestamptz NOT NULL DEFAULT now(),
  ingestion_run_id    uuid REFERENCES public.channel_sync_runs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_account_order ON public.channel_order_inbox(channel_account_id, bol_order_id, observed_at DESC);
GRANT SELECT ON public.channel_order_inbox TO authenticated;
GRANT ALL    ON public.channel_order_inbox TO service_role;
ALTER TABLE public.channel_order_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY p4_inbox_read ON public.channel_order_inbox
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
-- append-only
CREATE OR REPLACE FUNCTION public.p4_inbox_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'channel_order_inbox is append-only'; END $$;
DROP TRIGGER IF EXISTS p4_inbox_no_update ON public.channel_order_inbox;
CREATE TRIGGER p4_inbox_no_update BEFORE UPDATE OR DELETE ON public.channel_order_inbox
  FOR EACH ROW EXECUTE FUNCTION public.p4_inbox_immutable();

CREATE TABLE IF NOT EXISTS public.channel_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id  uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  bol_order_id        text NOT NULL,
  order_placed_at     timestamptz NOT NULL,
  buyer_email         text,
  currency            text NOT NULL DEFAULT 'EUR',
  total_amount_cents  integer NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
  status              public.p4_order_status NOT NULL DEFAULT 'open',
  first_observed_at   timestamptz NOT NULL DEFAULT now(),
  last_observed_at    timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, bol_order_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_orders_company ON public.channel_orders(company_id, order_placed_at DESC);
GRANT SELECT ON public.channel_orders TO authenticated;
GRANT ALL    ON public.channel_orders TO service_role;
ALTER TABLE public.channel_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY p4_orders_read ON public.channel_orders
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.channel_order_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES public.channel_orders(id) ON DELETE RESTRICT,
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id   uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  bol_order_item_id    text NOT NULL,
  bol_offer_id         text NOT NULL,
  ean                  text,
  quantity             integer NOT NULL CHECK (quantity > 0),
  unit_price_cents     integer NOT NULL CHECK (unit_price_cents >= 0),
  fulfilment_method    public.p4_fulfilment_method NOT NULL,
  imported_offer_id    uuid REFERENCES public.channel_imported_offers(id) ON DELETE SET NULL,
  sku_id               uuid REFERENCES public.catalog_skus(id) ON DELETE SET NULL,
  status               public.p4_order_line_status NOT NULL,
  exception_reason     text,
  reservation_id       uuid REFERENCES public.inventory_reservation_headers(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, bol_order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_col_order ON public.channel_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_col_status ON public.channel_order_lines(company_id, status);
CREATE INDEX IF NOT EXISTS idx_col_imported_offer ON public.channel_order_lines(imported_offer_id) WHERE imported_offer_id IS NOT NULL;
GRANT SELECT ON public.channel_order_lines TO authenticated;
GRANT ALL    ON public.channel_order_lines TO service_role;
ALTER TABLE public.channel_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY p4_lines_read ON public.channel_order_lines
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.channel_order_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id  uuid NOT NULL REFERENCES public.channel_order_lines(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_type     text NOT NULL,
  from_status    public.p4_order_line_status,
  to_status      public.p4_order_line_status,
  actor          text NOT NULL DEFAULT 'system',
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_line ON public.channel_order_events(order_line_id, created_at DESC);
GRANT SELECT ON public.channel_order_events TO authenticated;
GRANT ALL    ON public.channel_order_events TO service_role;
ALTER TABLE public.channel_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY p4_events_read ON public.channel_order_events
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE OR REPLACE FUNCTION public.p4_events_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'channel_order_events is append-only'; END $$;
DROP TRIGGER IF EXISTS p4_events_no_update ON public.channel_order_events;
CREATE TRIGGER p4_events_no_update BEFORE UPDATE OR DELETE ON public.channel_order_events
  FOR EACH ROW EXECUTE FUNCTION public.p4_events_immutable();

-- touch triggers
CREATE TRIGGER p4_orders_touch BEFORE UPDATE ON public.channel_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER p4_col_touch BEFORE UPDATE ON public.channel_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- RPCs
-- =============================================================================

-- Helper: resolve initial line state ---------------------------------------
CREATE OR REPLACE FUNCTION public._p4_resolve_initial_line_state(
  _company_id uuid, _channel_account_id uuid, _bol_offer_id text, _fulfilment public.p4_fulfilment_method,
  OUT _status public.p4_order_line_status,
  OUT _imported_offer_id uuid,
  OUT _sku_id uuid,
  OUT _reason text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _off RECORD;
BEGIN
  IF _fulfilment = 'FBB' THEN
    _status := 'exception_fbb'; _reason := 'FBB item — observed only, no internal fulfilment';
    -- still try to resolve link for reference
    SELECT id, review_status, linked_sku_id INTO _off
      FROM public.channel_imported_offers
     WHERE company_id = _company_id AND channel_account_id = _channel_account_id
       AND bol_offer_id = _bol_offer_id;
    _imported_offer_id := _off.id;
    IF _off.review_status = 'linked' THEN _sku_id := _off.linked_sku_id; END IF;
    RETURN;
  END IF;

  SELECT id, review_status, linked_sku_id INTO _off
    FROM public.channel_imported_offers
   WHERE company_id = _company_id AND channel_account_id = _channel_account_id
     AND bol_offer_id = _bol_offer_id;

  IF NOT FOUND THEN
    _status := 'exception_offer_not_linked';
    _reason := 'No imported offer for this bol_offer_id in this company/channel';
    RETURN;
  END IF;

  _imported_offer_id := _off.id;
  IF _off.review_status <> 'linked' THEN
    _status := 'exception_offer_not_linked';
    _reason := 'Imported offer review_status=' || _off.review_status::text || ' — merchant must link before fulfilment';
    RETURN;
  END IF;

  _sku_id := _off.linked_sku_id;
  _status := 'pending_reservation';
END $$;
REVOKE ALL ON FUNCTION public._p4_resolve_initial_line_state(uuid,uuid,text,public.p4_fulfilment_method) FROM PUBLIC, anon, authenticated;

-- ingest_bol_order ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_bol_order(
  _channel_account_id uuid,
  _bol_order_id       text,
  _order_placed_at    timestamptz,
  _buyer_email        text,
  _currency           text,
  _total_amount_cents integer,
  _raw_payload        jsonb,
  _lines              jsonb,
  _run_id             uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _acct   RECORD;
  _order  public.channel_orders%ROWTYPE;
  _order_id uuid;
  _line   jsonb;
  _st     public.p4_order_line_status;
  _iof    uuid;
  _sku    uuid;
  _reason text;
  _existing_line RECORD;
  _out_lines jsonb := '[]'::jsonb;
  _new_line_id uuid;
BEGIN
  IF _channel_account_id IS NULL OR _bol_order_id IS NULL OR _order_placed_at IS NULL
     OR _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'invalid inputs';
  END IF;

  SELECT id, company_id, provider INTO _acct
    FROM public.channel_accounts WHERE id = _channel_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'channel account not found'; END IF;
  IF _acct.provider <> 'bol' THEN RAISE EXCEPTION 'only bol supported'; END IF;

  -- Append-only inbox
  INSERT INTO public.channel_order_inbox(company_id, channel_account_id, provider, bol_order_id, raw_payload, ingestion_run_id)
  VALUES (_acct.company_id, _channel_account_id, 'bol', _bol_order_id, COALESCE(_raw_payload,'{}'::jsonb), _run_id);

  -- Upsert order header (idempotent). last_observed_at bumps every observation.
  INSERT INTO public.channel_orders(company_id, channel_account_id, bol_order_id, order_placed_at, buyer_email,
    currency, total_amount_cents, status, first_observed_at, last_observed_at)
  VALUES (_acct.company_id, _channel_account_id, _bol_order_id, _order_placed_at, _buyer_email,
    COALESCE(_currency,'EUR'), COALESCE(_total_amount_cents,0), 'open', now(), now())
  ON CONFLICT (channel_account_id, bol_order_id) DO UPDATE
    SET last_observed_at = now(),
        buyer_email      = COALESCE(EXCLUDED.buyer_email, public.channel_orders.buyer_email),
        total_amount_cents = GREATEST(public.channel_orders.total_amount_cents, EXCLUDED.total_amount_cents)
  RETURNING * INTO _order;
  _order_id := _order.id;

  -- Lines (each idempotent on (channel_account_id, bol_order_item_id))
  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF (_line->>'bol_order_item_id') IS NULL OR (_line->>'bol_offer_id') IS NULL
       OR (_line->>'quantity') IS NULL OR (_line->>'fulfilment_method') IS NULL THEN
      RAISE EXCEPTION 'invalid line %', _line;
    END IF;

    -- Check for existing (idempotent)
    SELECT * INTO _existing_line FROM public.channel_order_lines
      WHERE channel_account_id = _channel_account_id
        AND bol_order_item_id  = _line->>'bol_order_item_id';
    IF FOUND THEN
      IF _existing_line.company_id <> _acct.company_id THEN
        RAISE EXCEPTION 'cross-tenant line collision for %', _line->>'bol_order_item_id';
      END IF;
      _out_lines := _out_lines || jsonb_build_object(
        'line_id', _existing_line.id, 'status', _existing_line.status, 'idempotent', true);
      CONTINUE;
    END IF;

    SELECT * FROM public._p4_resolve_initial_line_state(
      _acct.company_id, _channel_account_id, _line->>'bol_offer_id',
      (_line->>'fulfilment_method')::public.p4_fulfilment_method
    ) INTO _st, _iof, _sku, _reason;

    INSERT INTO public.channel_order_lines(
      order_id, company_id, channel_account_id, bol_order_item_id, bol_offer_id, ean,
      quantity, unit_price_cents, fulfilment_method, imported_offer_id, sku_id, status, exception_reason)
    VALUES (
      _order_id, _acct.company_id, _channel_account_id,
      _line->>'bol_order_item_id', _line->>'bol_offer_id', _line->>'ean',
      (_line->>'quantity')::int, COALESCE((_line->>'unit_price_cents')::int, 0),
      (_line->>'fulfilment_method')::public.p4_fulfilment_method,
      _iof, _sku, _st, _reason)
    RETURNING id INTO _new_line_id;

    INSERT INTO public.channel_order_events(order_line_id, company_id, event_type, from_status, to_status, actor, payload)
    VALUES (_new_line_id, _acct.company_id, 'ingested', NULL, _st, 'system',
            jsonb_build_object('reason', _reason, 'bol_order_id', _bol_order_id));

    _out_lines := _out_lines || jsonb_build_object(
      'line_id', _new_line_id, 'status', _st, 'idempotent', false, 'reason', _reason);
  END LOOP;

  RETURN jsonb_build_object('order_id', _order_id, 'company_id', _acct.company_id, 'lines', _out_lines);
END $$;
REVOKE ALL ON FUNCTION public.ingest_bol_order(uuid,text,timestamptz,text,text,integer,jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_bol_order(uuid,text,timestamptz,text,text,integer,jsonb,jsonb,uuid) TO service_role;

-- reserve_bol_order_line ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_bol_order_line(_line_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _l RECORD; _hdr uuid;
BEGIN
  SELECT * INTO _l FROM public.channel_order_lines WHERE id = _line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'line not found'; END IF;
  IF _l.status = 'reserved' AND _l.reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('reservation_id', _l.reservation_id, 'idempotent', true);
  END IF;
  IF _l.status <> 'pending_reservation' THEN
    RAISE EXCEPTION 'cannot reserve line in status %', _l.status;
  END IF;
  IF _l.sku_id IS NULL THEN RAISE EXCEPTION 'line has no linked sku'; END IF;

  INSERT INTO public.inventory_reservation_headers(company_id, source_kind, source_id, status)
  VALUES (_l.company_id, 'order_line', _l.id, 'active')
  RETURNING id INTO _hdr;

  INSERT INTO public.inventory_reservation_lines(reservation_id, sku_id, required_base_quantity)
  VALUES (_hdr, _l.sku_id, _l.quantity);

  UPDATE public.channel_order_lines
     SET status = 'reserved', reservation_id = _hdr
   WHERE id = _line_id;

  INSERT INTO public.channel_order_events(order_line_id, company_id, event_type, from_status, to_status, actor, payload)
  VALUES (_line_id, _l.company_id, 'reserved', 'pending_reservation', 'reserved', 'system',
          jsonb_build_object('reservation_id', _hdr));

  RETURN jsonb_build_object('reservation_id', _hdr, 'idempotent', false);
END $$;
REVOKE ALL ON FUNCTION public.reserve_bol_order_line(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_bol_order_line(uuid) TO service_role;

-- cancel_bol_order_line ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_bol_order_line(_line_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _l RECORD; _hdr_status public.p2_reservation_status; _released int := 0;
BEGIN
  SELECT * INTO _l FROM public.channel_order_lines WHERE id = _line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'line not found'; END IF;
  IF _l.status = 'cancelled' THEN
    RETURN jsonb_build_object('cancelled', true, 'idempotent', true);
  END IF;
  IF _l.status = 'shipped' THEN RAISE EXCEPTION 'cannot cancel shipped line'; END IF;

  IF _l.reservation_id IS NOT NULL THEN
    SELECT status INTO _hdr_status FROM public.inventory_reservation_headers WHERE id = _l.reservation_id FOR UPDATE;
    IF _hdr_status = 'active' THEN
      UPDATE public.inventory_reservation_lines
         SET released_quantity = required_base_quantity - consumed_quantity
       WHERE reservation_id = _l.reservation_id
         AND (required_base_quantity - consumed_quantity - released_quantity) > 0
      RETURNING (required_base_quantity - released_quantity) INTO _released;
      UPDATE public.inventory_reservation_headers
         SET status = 'cancelled', updated_at = now()
       WHERE id = _l.reservation_id;
    END IF;
  END IF;

  UPDATE public.channel_order_lines
     SET status = 'cancelled', exception_reason = COALESCE(_reason, exception_reason)
   WHERE id = _line_id;

  INSERT INTO public.channel_order_events(order_line_id, company_id, event_type, from_status, to_status, actor, payload)
  VALUES (_line_id, _l.company_id, 'cancelled', _l.status, 'cancelled', 'system',
          jsonb_build_object('reason', _reason, 'reservation_released', _l.reservation_id IS NOT NULL));

  RETURN jsonb_build_object('cancelled', true, 'idempotent', false, 'reservation_released', _l.reservation_id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.cancel_bol_order_line(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_bol_order_line(uuid,text) TO service_role;

-- resolve_bol_order_line_link ---------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_bol_order_line_link(_line_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _l RECORD; _off RECORD;
BEGIN
  SELECT * INTO _l FROM public.channel_order_lines WHERE id = _line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'line not found'; END IF;
  IF _l.status <> 'exception_offer_not_linked' THEN
    RETURN jsonb_build_object('changed', false, 'status', _l.status);
  END IF;

  SELECT id, review_status, linked_sku_id INTO _off
    FROM public.channel_imported_offers
   WHERE company_id = _l.company_id AND channel_account_id = _l.channel_account_id
     AND bol_offer_id = _l.bol_offer_id;
  IF NOT FOUND OR _off.review_status <> 'linked' OR _off.linked_sku_id IS NULL THEN
    RETURN jsonb_build_object('changed', false, 'status', _l.status);
  END IF;

  UPDATE public.channel_order_lines
     SET status = 'pending_reservation', imported_offer_id = _off.id, sku_id = _off.linked_sku_id,
         exception_reason = NULL
   WHERE id = _line_id;

  INSERT INTO public.channel_order_events(order_line_id, company_id, event_type, from_status, to_status, actor, payload)
  VALUES (_line_id, _l.company_id, 'link_resolved', 'exception_offer_not_linked', 'pending_reservation', 'system',
          jsonb_build_object('imported_offer_id', _off.id, 'sku_id', _off.linked_sku_id));

  RETURN jsonb_build_object('changed', true, 'status', 'pending_reservation', 'sku_id', _off.linked_sku_id);
END $$;
REVOKE ALL ON FUNCTION public.resolve_bol_order_line_link(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_bol_order_line_link(uuid) TO service_role;

-- mark_bol_order_line_shipped (basic — full FBR shipment in M5) -----------
CREATE OR REPLACE FUNCTION public.mark_bol_order_line_shipped(_line_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _l RECORD;
BEGIN
  SELECT * INTO _l FROM public.channel_order_lines WHERE id = _line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'line not found'; END IF;
  IF _l.status = 'shipped' THEN RETURN jsonb_build_object('idempotent', true); END IF;
  IF _l.status <> 'reserved' THEN RAISE EXCEPTION 'cannot ship line in status %', _l.status; END IF;
  UPDATE public.channel_order_lines SET status='shipped' WHERE id = _line_id;
  INSERT INTO public.channel_order_events(order_line_id, company_id, event_type, from_status, to_status, actor)
  VALUES (_line_id, _l.company_id, 'shipped', 'reserved', 'shipped', 'system');
  RETURN jsonb_build_object('idempotent', false);
END $$;
REVOKE ALL ON FUNCTION public.mark_bol_order_line_shipped(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bol_order_line_shipped(uuid) TO service_role;
