
-- ============================================================================
-- Phase 2 Migration 3 — Reservations
-- Single subtraction model: logical reservations. All-or-nothing (no 'short').
-- ============================================================================

-- Enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.p2_reservation_source_kind AS ENUM ('order_line','auction_lot_item','manual_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.p2_reservation_status AS ENUM ('active','fully_consumed','fully_released','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables -------------------------------------------------------------------
CREATE TABLE public.inventory_reservation_headers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_kind  public.p2_reservation_source_kind NOT NULL,
  source_id    uuid NOT NULL,
  status       public.p2_reservation_status NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id)
);
CREATE INDEX inv_resv_headers_company_status_idx
  ON public.inventory_reservation_headers(company_id, status);
GRANT SELECT ON public.inventory_reservation_headers TO authenticated;
GRANT ALL    ON public.inventory_reservation_headers TO service_role;
ALTER TABLE public.inventory_reservation_headers ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_resv_headers_read ON public.inventory_reservation_headers
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE TRIGGER inv_resv_headers_touch BEFORE UPDATE ON public.inventory_reservation_headers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER inv_resv_headers_immutable_company BEFORE UPDATE ON public.inventory_reservation_headers
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();

CREATE TABLE public.inventory_reservation_lines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id         uuid NOT NULL REFERENCES public.inventory_reservation_headers(id) ON DELETE CASCADE,
  sku_id                 uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  required_base_quantity int  NOT NULL CHECK (required_base_quantity > 0),
  consumed_quantity      int  NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  released_quantity      int  NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, sku_id),
  CHECK (consumed_quantity + released_quantity <= required_base_quantity)
);
CREATE INDEX inv_resv_lines_sku_idx ON public.inventory_reservation_lines(sku_id);
GRANT SELECT ON public.inventory_reservation_lines TO authenticated;
GRANT ALL    ON public.inventory_reservation_lines TO service_role;
ALTER TABLE public.inventory_reservation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_resv_lines_read ON public.inventory_reservation_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_reservation_headers h
    WHERE h.id = reservation_id AND public.is_company_member(h.company_id, auth.uid())
  ));
CREATE TRIGGER inv_resv_lines_touch BEFORE UPDATE ON public.inventory_reservation_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.inventory_reservation_allocations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id            uuid NOT NULL REFERENCES public.inventory_reservation_lines(id) ON DELETE CASCADE,
  warehouse_id       uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  location_id        uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  allocated_quantity int  NOT NULL CHECK (allocated_quantity > 0),
  consumed_quantity  int  NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  released_quantity  int  NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (consumed_quantity + released_quantity <= allocated_quantity)
);
CREATE INDEX inv_resv_alloc_line_idx ON public.inventory_reservation_allocations(line_id);
CREATE INDEX inv_resv_alloc_wh_idx   ON public.inventory_reservation_allocations(warehouse_id);
GRANT SELECT ON public.inventory_reservation_allocations TO authenticated;
GRANT ALL    ON public.inventory_reservation_allocations TO service_role;
ALTER TABLE public.inventory_reservation_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_resv_alloc_read ON public.inventory_reservation_allocations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_reservation_lines l
    JOIN public.inventory_reservation_headers h ON h.id = l.reservation_id
    WHERE l.id = line_id AND public.is_company_member(h.company_id, auth.uid())
  ));
CREATE TRIGGER inv_resv_alloc_touch BEFORE UPDATE ON public.inventory_reservation_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helper: refresh header status ------------------------------------------
CREATE OR REPLACE FUNCTION public._refresh_reservation_status(_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _all_consumed boolean; _all_released boolean; _cur public.p2_reservation_status;
BEGIN
  SELECT status INTO _cur FROM public.inventory_reservation_headers WHERE id = _reservation_id;
  IF _cur IN ('fully_consumed','fully_released','cancelled') THEN RETURN; END IF;
  SELECT bool_and(consumed_quantity = required_base_quantity),
         bool_and(released_quantity = required_base_quantity)
    INTO _all_consumed, _all_released
    FROM public.inventory_reservation_lines WHERE reservation_id = _reservation_id;
  IF _all_consumed THEN
    UPDATE public.inventory_reservation_headers SET status='fully_consumed', updated_at=now()
      WHERE id = _reservation_id;
  ELSIF _all_released THEN
    UPDATE public.inventory_reservation_headers SET status='fully_released', updated_at=now()
      WHERE id = _reservation_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._refresh_reservation_status(uuid) FROM PUBLIC, anon, authenticated;

-- Helper: active reserved base units per (company, sku) -----------------
CREATE OR REPLACE FUNCTION public.sku_active_reserved(_company_id uuid, _sku_id uuid)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _q int;
BEGIN
  IF NOT public.is_company_member(_company_id, auth.uid()) THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(l.required_base_quantity - l.consumed_quantity - l.released_quantity),0)::int INTO _q
    FROM public.inventory_reservation_lines l
    JOIN public.inventory_reservation_headers h ON h.id = l.reservation_id
   WHERE h.company_id = _company_id AND l.sku_id = _sku_id AND h.status = 'active';
  RETURN _q;
END $$;
REVOKE ALL ON FUNCTION public.sku_active_reserved(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sku_active_reserved(uuid,uuid) TO authenticated;

-- ============================================================================
-- create_reservation — atomic all-or-nothing
-- _lines: [{ sku_id, allocations:[{warehouse_id, location_id?, quantity}] }]
-- required_base_quantity per line = sum of its allocation quantities.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_reservation(
  _company_id  uuid,
  _source_kind text,
  _source_id   uuid,
  _lines       jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _kind public.p2_reservation_source_kind;
  _existing uuid;
  _hdr_id uuid;
  _line jsonb; _alloc jsonb;
  _sku_id uuid; _line_id uuid;
  _line_required int;
  _sellable int; _reserved int; _avail int;
  _wh_id uuid; _loc_id uuid; _wh_company uuid; _wh_status public.p2_lifecycle_status;
  _wh_req_loc boolean; _loc_wh uuid; _loc_status public.p2_lifecycle_status;
  _sku_company uuid;
  _wh_sellable int; _wh_alloc int; _wh_avail int;
  _q int;
  _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id, _actor) THEN
    RAISE EXCEPTION 'not a member of company %', _company_id;
  END IF;
  IF NOT public.company_member_has_permission(_company_id, _actor, 'reservations.manage') THEN
    RAISE EXCEPTION 'permission reservations.manage required' USING ERRCODE='42501';
  END IF;

  BEGIN _kind := _source_kind::public.p2_reservation_source_kind;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid source_kind: %', _source_kind; END;

  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'lines must be a non-empty array';
  END IF;

  -- Idempotency: same (source_kind, source_id) returns existing header.
  SELECT id INTO _existing FROM public.inventory_reservation_headers
    WHERE source_kind = _kind AND source_id = _source_id;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reservation_id', _existing, 'idempotent_replay', true);
  END IF;

  INSERT INTO public.inventory_reservation_headers(company_id, source_kind, source_id, status)
    VALUES (_company_id, _kind, _source_id, 'active')
    RETURNING id INTO _hdr_id;

  FOR _line IN SELECT jsonb_array_elements(_lines) LOOP
    _sku_id := (_line->>'sku_id')::uuid;
    IF _sku_id IS NULL THEN RAISE EXCEPTION 'line.sku_id required'; END IF;

    SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = _sku_id;
    IF _sku_company IS NULL OR _sku_company <> _company_id THEN
      RAISE EXCEPTION 'sku % not in company', _sku_id;
    END IF;

    IF jsonb_typeof(_line->'allocations') <> 'array'
       OR jsonb_array_length(_line->'allocations') = 0 THEN
      RAISE EXCEPTION 'line for sku % has no allocations', _sku_id;
    END IF;

    -- Serialize on this (company, sku) to prevent double reservation under concurrency.
    _lock_key := 'resv:' || _company_id::text || ':' || _sku_id::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

    -- Compute line required from allocations.
    SELECT COALESCE(SUM((a->>'quantity')::int),0) INTO _line_required
      FROM jsonb_array_elements(_line->'allocations') a;
    IF _line_required <= 0 THEN RAISE EXCEPTION 'line required quantity must be > 0'; END IF;

    -- Global availability check for this SKU.
    SELECT COALESCE(SUM(quantity),0)::int INTO _sellable
      FROM public.inventory_balances
     WHERE company_id = _company_id AND sku_id = _sku_id AND disposition = 'sellable';
    SELECT COALESCE(SUM(l.required_base_quantity - l.consumed_quantity - l.released_quantity),0)::int
      INTO _reserved
      FROM public.inventory_reservation_lines l
      JOIN public.inventory_reservation_headers h ON h.id = l.reservation_id
     WHERE h.company_id = _company_id AND l.sku_id = _sku_id AND h.status = 'active';
    _avail := _sellable - _reserved;
    IF _line_required > _avail THEN
      RAISE EXCEPTION 'insufficient available for sku % (need %, have %)', _sku_id, _line_required, _avail
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.inventory_reservation_lines(reservation_id, sku_id, required_base_quantity)
      VALUES (_hdr_id, _sku_id, _line_required)
      RETURNING id INTO _line_id;

    -- Per-warehouse allocation validation.
    FOR _alloc IN SELECT jsonb_array_elements(_line->'allocations') LOOP
      _wh_id := (_alloc->>'warehouse_id')::uuid;
      _loc_id := NULLIF(_alloc->>'location_id','')::uuid;
      _q := (_alloc->>'quantity')::int;
      IF _q <= 0 THEN RAISE EXCEPTION 'allocation quantity must be > 0'; END IF;

      SELECT company_id, requires_location, status INTO _wh_company, _wh_req_loc, _wh_status
        FROM public.warehouses WHERE id = _wh_id;
      IF _wh_company IS NULL OR _wh_company <> _company_id THEN
        RAISE EXCEPTION 'warehouse % not in company', _wh_id;
      END IF;
      IF _wh_status <> 'active' THEN RAISE EXCEPTION 'warehouse % is not active', _wh_id; END IF;

      IF _loc_id IS NOT NULL THEN
        SELECT warehouse_id, status INTO _loc_wh, _loc_status
          FROM public.warehouse_locations WHERE id = _loc_id;
        IF _loc_wh IS NULL OR _loc_wh <> _wh_id THEN
          RAISE EXCEPTION 'location does not belong to warehouse';
        END IF;
        IF _loc_status <> 'active' THEN RAISE EXCEPTION 'location inactive'; END IF;
      END IF;

      -- Per-warehouse availability = sellable in wh - active allocated in wh (not yet consumed/released).
      SELECT COALESCE(SUM(quantity),0)::int INTO _wh_sellable
        FROM public.inventory_balances
       WHERE company_id = _company_id AND sku_id = _sku_id
         AND warehouse_id = _wh_id AND disposition = 'sellable';
      SELECT COALESCE(SUM(a.allocated_quantity - a.consumed_quantity - a.released_quantity),0)::int
        INTO _wh_alloc
        FROM public.inventory_reservation_allocations a
        JOIN public.inventory_reservation_lines l ON l.id = a.line_id
        JOIN public.inventory_reservation_headers h ON h.id = l.reservation_id
       WHERE h.company_id = _company_id AND l.sku_id = _sku_id
         AND a.warehouse_id = _wh_id AND h.status = 'active';
      _wh_avail := _wh_sellable - _wh_alloc;
      IF _q > _wh_avail THEN
        RAISE EXCEPTION 'insufficient available in warehouse % for sku % (need %, have %)',
          _wh_id, _sku_id, _q, _wh_avail USING ERRCODE = '23514';
      END IF;

      INSERT INTO public.inventory_reservation_allocations(line_id, warehouse_id, location_id, allocated_quantity)
        VALUES (_line_id, _wh_id, _loc_id, _q);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reservation_id', _hdr_id);
END $$;
REVOKE ALL ON FUNCTION public.create_reservation(uuid,text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reservation(uuid,text,uuid,jsonb) TO authenticated;

-- ============================================================================
-- pick_reservation_allocation — atomic pick + counter update.
-- Posts a conserving pick move (-sellable, +picked) via post_inventory_transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pick_reservation_allocation(
  _allocation_id uuid,
  _quantity      int,
  _location_id   uuid DEFAULT NULL,
  _lot_id        uuid DEFAULT NULL,
  _serial_id     uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _entries jsonb;
  _tx_res jsonb;
  _remaining int;
  _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;

  SELECT * INTO _alloc FROM public.inventory_reservation_allocations
    WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;

  SELECT * INTO _line FROM public.inventory_reservation_lines
    WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr FROM public.inventory_reservation_headers
    WHERE id = _line.reservation_id FOR UPDATE;

  IF _hdr.status <> 'active' THEN
    RAISE EXCEPTION 'reservation is not active (status=%)', _hdr.status;
  END IF;
  IF NOT public.company_member_has_permission(_hdr.company_id, _actor, 'fulfilment.pick') THEN
    RAISE EXCEPTION 'permission fulfilment.pick required' USING ERRCODE='42501';
  END IF;

  _lock_key := 'resv:' || _hdr.company_id::text || ':' || _line.sku_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

  _remaining := _alloc.allocated_quantity - _alloc.consumed_quantity - _alloc.released_quantity;
  IF _quantity > _remaining THEN
    RAISE EXCEPTION 'quantity % exceeds allocation remaining %', _quantity, _remaining;
  END IF;

  _entries := jsonb_build_array(
    jsonb_build_object(
      'sku_id', _line.sku_id, 'warehouse_id', _alloc.warehouse_id,
      'location_id', COALESCE(_location_id, _alloc.location_id),
      'disposition', 'sellable',
      'lot_id', _lot_id, 'serial_id', _serial_id,
      'quantity', -_quantity),
    jsonb_build_object(
      'sku_id', _line.sku_id, 'warehouse_id', _alloc.warehouse_id,
      'location_id', COALESCE(_location_id, _alloc.location_id),
      'disposition', 'picked',
      'lot_id', _lot_id, 'serial_id', _serial_id,
      'quantity', _quantity));

  _tx_res := public.post_inventory_transaction(
    _hdr.company_id, 'pick', _entries, 'reservation_allocation', _alloc.id, NULL,
    jsonb_build_object('reservation_id', _hdr.id, 'line_id', _line.id), NULL);

  UPDATE public.inventory_reservation_allocations
     SET consumed_quantity = consumed_quantity + _quantity, updated_at = now()
   WHERE id = _alloc.id;
  UPDATE public.inventory_reservation_lines
     SET consumed_quantity = consumed_quantity + _quantity, updated_at = now()
   WHERE id = _line.id;
  PERFORM public._refresh_reservation_status(_hdr.id);

  RETURN jsonb_build_object('ok', true, 'transaction_id', _tx_res->>'transaction_id',
    'allocation_id', _alloc.id, 'quantity', _quantity);
END $$;
REVOKE ALL ON FUNCTION public.pick_reservation_allocation(uuid,int,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_reservation_allocation(uuid,int,uuid,uuid,uuid) TO authenticated;

-- ============================================================================
-- release_reservation — releases remaining quantity (all or specified per line).
-- _release_lines: NULL => release all remaining across all lines
--                 [{ line_id, quantity }] => release that quantity from that line
-- Cancels: sets header status='cancelled' if _cancel=true; otherwise 'fully_released' when all released.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_reservation(
  _reservation_id uuid,
  _release_lines  jsonb DEFAULT NULL,
  _cancel         boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _hdr public.inventory_reservation_headers%ROWTYPE;
  _l record; _a record;
  _spec jsonb; _to_release int; _remaining int; _take int;
  _line_target int;
  _lock_key text;
  _released_total int := 0;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO _hdr FROM public.inventory_reservation_headers
    WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  IF NOT public.company_member_has_permission(_hdr.company_id, _actor, 'reservations.manage') THEN
    RAISE EXCEPTION 'permission reservations.manage required' USING ERRCODE='42501';
  END IF;
  IF _hdr.status <> 'active' THEN
    RAISE EXCEPTION 'reservation not active (status=%)', _hdr.status;
  END IF;

  FOR _l IN SELECT * FROM public.inventory_reservation_lines
              WHERE reservation_id = _reservation_id FOR UPDATE
  LOOP
    _lock_key := 'resv:' || _hdr.company_id::text || ':' || _l.sku_id::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));
    _line_target := _l.required_base_quantity - _l.consumed_quantity - _l.released_quantity;

    IF _release_lines IS NULL THEN
      _to_release := _line_target;
    ELSE
      SELECT (x->>'quantity')::int INTO _to_release
        FROM jsonb_array_elements(_release_lines) x
       WHERE (x->>'line_id')::uuid = _l.id;
      _to_release := COALESCE(_to_release, 0);
      IF _to_release < 0 THEN RAISE EXCEPTION 'release quantity must be >= 0'; END IF;
      IF _to_release > _line_target THEN
        RAISE EXCEPTION 'release quantity % exceeds releasable % on line %',
          _to_release, _line_target, _l.id;
      END IF;
    END IF;

    IF _to_release = 0 THEN CONTINUE; END IF;

    _remaining := _to_release;
    FOR _a IN SELECT * FROM public.inventory_reservation_allocations
                WHERE line_id = _l.id FOR UPDATE
    LOOP
      EXIT WHEN _remaining = 0;
      _take := LEAST(_remaining, _a.allocated_quantity - _a.consumed_quantity - _a.released_quantity);
      IF _take > 0 THEN
        UPDATE public.inventory_reservation_allocations
          SET released_quantity = released_quantity + _take, updated_at = now()
          WHERE id = _a.id;
        _remaining := _remaining - _take;
      END IF;
    END LOOP;
    IF _remaining > 0 THEN
      RAISE EXCEPTION 'internal: could not fully release line % (%s left)', _l.id, _remaining;
    END IF;
    UPDATE public.inventory_reservation_lines
      SET released_quantity = released_quantity + _to_release, updated_at = now()
      WHERE id = _l.id;
    _released_total := _released_total + _to_release;
  END LOOP;

  IF _cancel THEN
    UPDATE public.inventory_reservation_headers SET status='cancelled', updated_at=now()
      WHERE id = _reservation_id;
  ELSE
    PERFORM public._refresh_reservation_status(_reservation_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'released_total', _released_total,
    'reservation_id', _reservation_id);
END $$;
REVOKE ALL ON FUNCTION public.release_reservation(uuid,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid,jsonb,boolean) TO authenticated;

-- Convenience wrapper.
CREATE OR REPLACE FUNCTION public.cancel_reservation(_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN public.release_reservation(_reservation_id, NULL, true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;
