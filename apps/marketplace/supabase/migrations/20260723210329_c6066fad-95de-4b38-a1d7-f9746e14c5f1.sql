-- Phase 2 Migration 2: lot/serial tracking + immutable ledger + balance
-- projection + atomic post/reverse/rebuild RPCs.

CREATE TYPE public.p2_tx_status AS ENUM ('posted','reversed');
CREATE TYPE public.p2_tx_reason AS ENUM (
  'stock_receipt','stock_adjustment',
  'pick','pack','ship','pick_reversal','pack_reversal',
  'return_receipt','return_restock','return_quarantine',
  'damage_classification','disposal',
  'transfer_out','transfer_in',
  'reservation_consume','reservation_release','reversal'
);

-- =========================================================================
-- Lots
-- =========================================================================
CREATE TABLE public.inventory_lots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sku_id       uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  code         text NOT NULL CHECK (length(trim(code)) > 0),
  expiry       date,
  status       public.p2_lifecycle_status NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inventory_lots_sku_code_uidx ON public.inventory_lots(sku_id, lower(code));
CREATE INDEX inventory_lots_company_idx ON public.inventory_lots(company_id);
GRANT SELECT, INSERT, UPDATE ON public.inventory_lots TO authenticated;
GRANT ALL ON public.inventory_lots TO service_role;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY lots_read ON public.inventory_lots FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY lots_write ON public.inventory_lots FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'inventory.adjust'));
CREATE POLICY lots_update ON public.inventory_lots FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'inventory.adjust'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'inventory.adjust'));
CREATE TRIGGER lots_touch BEFORE UPDATE ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER lots_immutable_company BEFORE UPDATE ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();

CREATE OR REPLACE FUNCTION public.p2_validate_track_sku_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _sku_company uuid;
BEGIN
  SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = NEW.sku_id;
  IF _sku_company IS NULL OR _sku_company <> NEW.company_id THEN
    RAISE EXCEPTION 'sku % is not in company %', NEW.sku_id, NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lots_validate BEFORE INSERT OR UPDATE OF sku_id, company_id ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION public.p2_validate_track_sku_company();

-- =========================================================================
-- Serials
-- =========================================================================
CREATE TABLE public.inventory_serials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sku_id       uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  code         text NOT NULL CHECK (length(trim(code)) > 0),
  status       public.p2_lifecycle_status NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inventory_serials_sku_code_uidx ON public.inventory_serials(sku_id, lower(code));
CREATE INDEX inventory_serials_company_idx ON public.inventory_serials(company_id);
GRANT SELECT, INSERT, UPDATE ON public.inventory_serials TO authenticated;
GRANT ALL ON public.inventory_serials TO service_role;
ALTER TABLE public.inventory_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY serials_read ON public.inventory_serials FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY serials_write ON public.inventory_serials FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'inventory.adjust'));
CREATE POLICY serials_update ON public.inventory_serials FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'inventory.adjust'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'inventory.adjust'));
CREATE TRIGGER serials_touch BEFORE UPDATE ON public.inventory_serials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER serials_immutable_company BEFORE UPDATE ON public.inventory_serials
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();
CREATE TRIGGER serials_validate BEFORE INSERT OR UPDATE OF sku_id, company_id ON public.inventory_serials
  FOR EACH ROW EXECUTE FUNCTION public.p2_validate_track_sku_company();

-- =========================================================================
-- Inventory transactions (header)
-- =========================================================================
CREATE TABLE public.inventory_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  reason            public.p2_tx_reason NOT NULL,
  status            public.p2_tx_status NOT NULL DEFAULT 'posted',
  source_type       text,
  source_id         uuid,
  idempotency_key   text,
  reversal_of       uuid REFERENCES public.inventory_transactions(id),
  reversed_by       uuid REFERENCES public.inventory_transactions(id),
  actor_user_id     uuid REFERENCES auth.users(id),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_at         timestamptz NOT NULL DEFAULT now(),
  reversed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inv_tx_company_idem_uidx
  ON public.inventory_transactions(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX inv_tx_company_posted_idx ON public.inventory_transactions(company_id, posted_at DESC);
CREATE INDEX inv_tx_source_idx ON public.inventory_transactions(company_id, source_type, source_id);

GRANT SELECT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_tx_read ON public.inventory_transactions FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'inventory.read'));

CREATE OR REPLACE FUNCTION public.p2_tx_header_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'inventory transactions cannot be deleted'; END IF;
  IF OLD.status = 'reversed' THEN RAISE EXCEPTION 'reversed transactions are immutable'; END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.reason <> OLD.reason
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.reversal_of IS DISTINCT FROM OLD.reversal_of
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.posted_at <> OLD.posted_at
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'inventory transaction headers are immutable except for reversal metadata';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inv_tx_guard BEFORE UPDATE OR DELETE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.p2_tx_header_guard();

-- =========================================================================
-- Inventory transaction entries (ledger, append-only)
-- =========================================================================
CREATE TABLE public.inventory_transaction_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sku_id         uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  warehouse_id   uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  location_id    uuid REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  disposition    text NOT NULL REFERENCES public.inventory_dispositions(key),
  lot_id         uuid REFERENCES public.inventory_lots(id),
  serial_id      uuid REFERENCES public.inventory_serials(id),
  quantity       integer NOT NULL CHECK (quantity <> 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inv_entries_tx_idx ON public.inventory_transaction_entries(transaction_id);
CREATE INDEX inv_entries_balance_idx ON public.inventory_transaction_entries
  (company_id, sku_id, warehouse_id, disposition);

GRANT SELECT ON public.inventory_transaction_entries TO authenticated;
GRANT ALL ON public.inventory_transaction_entries TO service_role;
ALTER TABLE public.inventory_transaction_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_entries_read ON public.inventory_transaction_entries FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'inventory.read'));

CREATE OR REPLACE FUNCTION public.p2_ledger_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'inventory ledger entries are immutable';
END $$;
CREATE TRIGGER inv_entries_no_update BEFORE UPDATE OR DELETE ON public.inventory_transaction_entries
  FOR EACH ROW EXECUTE FUNCTION public.p2_ledger_immutable();

-- =========================================================================
-- Inventory balances
-- =========================================================================
CREATE TABLE public.inventory_balances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sku_id         uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  warehouse_id   uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  location_id    uuid REFERENCES public.warehouse_locations(id),
  disposition    text NOT NULL REFERENCES public.inventory_dispositions(key),
  lot_id         uuid REFERENCES public.inventory_lots(id),
  serial_id      uuid REFERENCES public.inventory_serials(id),
  quantity       integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  version        bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inventory_balances_identity_uidx ON public.inventory_balances
  (company_id, sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)
  NULLS NOT DISTINCT;

GRANT SELECT ON public.inventory_balances TO authenticated;
GRANT ALL ON public.inventory_balances TO service_role;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_balances_read ON public.inventory_balances FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'inventory.read'));

-- =========================================================================
-- post_inventory_transaction
-- =========================================================================
CREATE OR REPLACE FUNCTION public.post_inventory_transaction(
  _company_id      uuid,
  _reason          text,
  _entries         jsonb,
  _source_type     text DEFAULT NULL,
  _source_id       uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _metadata        jsonb DEFAULT '{}'::jsonb,
  _reversal_of     uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _tx_id uuid;
  _reason_enum public.p2_tx_reason;
  _perm text;
  _existing uuid;
  _entry jsonb;
  _sku_company uuid; _wh_company uuid; _wh_req_loc boolean; _wh_status public.p2_lifecycle_status;
  _loc_wh uuid; _loc_status public.p2_lifecycle_status;
  _lot_sku uuid; _serial_sku uuid;
  _tracking public.p2_tracking_mode;
  _bal record;
  _net_by_sku jsonb := '{}'::jsonb;
  _conserving boolean;
  _sku_key text;
  _new_qty int;
  _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id, _actor) THEN
    RAISE EXCEPTION 'not a member of company %', _company_id;
  END IF;
  BEGIN _reason_enum := _reason::public.p2_tx_reason;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid reason: %', _reason; END;

  _perm := CASE _reason_enum
    WHEN 'stock_receipt' THEN 'inventory.adjust'
    WHEN 'stock_adjustment' THEN 'inventory.adjust'
    WHEN 'pick' THEN 'fulfilment.pick'
    WHEN 'pack' THEN 'fulfilment.pack'
    WHEN 'ship' THEN 'fulfilment.ship'
    WHEN 'pick_reversal' THEN 'fulfilment.pick'
    WHEN 'pack_reversal' THEN 'fulfilment.pack'
    WHEN 'return_receipt' THEN 'fulfilment.return'
    WHEN 'return_restock' THEN 'fulfilment.return'
    WHEN 'return_quarantine' THEN 'fulfilment.return'
    WHEN 'damage_classification' THEN 'inventory.adjust'
    WHEN 'disposal' THEN 'inventory.disposal'
    WHEN 'transfer_out' THEN 'inventory.transfer'
    WHEN 'transfer_in' THEN 'inventory.transfer'
    WHEN 'reservation_consume' THEN 'fulfilment.pick'
    WHEN 'reservation_release' THEN 'reservations.manage'
    WHEN 'reversal' THEN 'inventory.reverse'
  END;
  IF NOT public.company_member_has_permission(_company_id, _actor, _perm) THEN
    RAISE EXCEPTION 'permission % required', _perm USING ERRCODE='42501';
  END IF;

  _conserving := _reason_enum IN (
    'pick','pack','pick_reversal','pack_reversal',
    'return_restock','return_quarantine','damage_classification',
    'transfer_out','transfer_in'
  );

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.inventory_transactions
      WHERE company_id = _company_id AND idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'transaction_id', _existing, 'idempotent_replay', true);
    END IF;
  END IF;

  INSERT INTO public.inventory_transactions
    (company_id, reason, source_type, source_id, idempotency_key, actor_user_id, metadata, reversal_of)
  VALUES (_company_id, _reason_enum, _source_type, _source_id, _idempotency_key, _actor,
          COALESCE(_metadata,'{}'::jsonb), _reversal_of)
  RETURNING id INTO _tx_id;

  IF jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) = 0 THEN
    RAISE EXCEPTION 'entries must be a non-empty array';
  END IF;

  FOR _entry IN SELECT jsonb_array_elements(_entries) LOOP
    IF (_entry->>'quantity') IS NULL OR (_entry->>'quantity')::int = 0 THEN
      RAISE EXCEPTION 'entry quantity must be non-zero';
    END IF;

    SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = (_entry->>'sku_id')::uuid;
    IF _sku_company IS NULL OR _sku_company <> _company_id THEN
      RAISE EXCEPTION 'sku % not in company', _entry->>'sku_id';
    END IF;

    SELECT company_id, requires_location, status INTO _wh_company, _wh_req_loc, _wh_status
      FROM public.warehouses WHERE id = (_entry->>'warehouse_id')::uuid;
    IF _wh_company IS NULL OR _wh_company <> _company_id THEN
      RAISE EXCEPTION 'warehouse % not in company', _entry->>'warehouse_id';
    END IF;
    IF _wh_status <> 'active' THEN
      RAISE EXCEPTION 'warehouse % is not active', _entry->>'warehouse_id';
    END IF;

    IF NULLIF(_entry->>'location_id','') IS NOT NULL THEN
      SELECT warehouse_id, status INTO _loc_wh, _loc_status
        FROM public.warehouse_locations WHERE id = (_entry->>'location_id')::uuid;
      IF _loc_wh IS NULL THEN RAISE EXCEPTION 'location not found'; END IF;
      IF _loc_wh <> (_entry->>'warehouse_id')::uuid THEN
        RAISE EXCEPTION 'location does not belong to warehouse';
      END IF;
      IF _loc_status <> 'active' THEN RAISE EXCEPTION 'location inactive'; END IF;
    ELSIF _wh_req_loc THEN
      RAISE EXCEPTION 'warehouse % requires location_id', _entry->>'warehouse_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.inventory_dispositions WHERE key = _entry->>'disposition') THEN
      RAISE EXCEPTION 'unknown disposition: %', _entry->>'disposition';
    END IF;

    SELECT tracking_mode INTO _tracking FROM public.catalog_skus WHERE id = (_entry->>'sku_id')::uuid;
    IF _tracking = 'lot' THEN
      IF NULLIF(_entry->>'lot_id','') IS NULL THEN
        RAISE EXCEPTION 'sku % requires lot_id', _entry->>'sku_id';
      END IF;
      SELECT sku_id INTO _lot_sku FROM public.inventory_lots WHERE id = (_entry->>'lot_id')::uuid;
      IF _lot_sku IS NULL OR _lot_sku <> (_entry->>'sku_id')::uuid THEN
        RAISE EXCEPTION 'lot does not belong to sku';
      END IF;
    ELSIF _tracking = 'serial' THEN
      IF NULLIF(_entry->>'serial_id','') IS NULL THEN
        RAISE EXCEPTION 'sku % requires serial_id', _entry->>'sku_id';
      END IF;
      IF abs((_entry->>'quantity')::int) <> 1 THEN
        RAISE EXCEPTION 'serial-tracked entries must have quantity 1 or -1';
      END IF;
      SELECT sku_id INTO _serial_sku FROM public.inventory_serials WHERE id = (_entry->>'serial_id')::uuid;
      IF _serial_sku IS NULL OR _serial_sku <> (_entry->>'sku_id')::uuid THEN
        RAISE EXCEPTION 'serial does not belong to sku';
      END IF;
    ELSE
      IF NULLIF(_entry->>'lot_id','') IS NOT NULL OR NULLIF(_entry->>'serial_id','') IS NOT NULL THEN
        RAISE EXCEPTION 'sku with tracking_mode=none cannot have lot_id/serial_id';
      END IF;
    END IF;

    INSERT INTO public.inventory_transaction_entries
      (transaction_id, company_id, sku_id, warehouse_id, location_id, disposition,
       lot_id, serial_id, quantity)
    VALUES (_tx_id, _company_id,
            (_entry->>'sku_id')::uuid,
            (_entry->>'warehouse_id')::uuid,
            NULLIF(_entry->>'location_id','')::uuid,
            _entry->>'disposition',
            NULLIF(_entry->>'lot_id','')::uuid,
            NULLIF(_entry->>'serial_id','')::uuid,
            (_entry->>'quantity')::int);

    _sku_key := (_entry->>'sku_id');
    _net_by_sku := jsonb_set(_net_by_sku, ARRAY[_sku_key],
      to_jsonb(COALESCE((_net_by_sku->>_sku_key)::int, 0) + (_entry->>'quantity')::int));
  END LOOP;

  IF _conserving THEN
    FOR _sku_key IN SELECT jsonb_object_keys(_net_by_sku) LOOP
      IF (_net_by_sku->>_sku_key)::int <> 0 THEN
        RAISE EXCEPTION 'conserving transaction does not balance for sku %', _sku_key;
      END IF;
    END LOOP;
  END IF;

  FOR _bal IN
    SELECT company_id, sku_id, warehouse_id, location_id, disposition, lot_id, serial_id,
           SUM(quantity)::int AS delta
      FROM public.inventory_transaction_entries WHERE transaction_id = _tx_id
      GROUP BY 1,2,3,4,5,6,7
  LOOP
    _lock_key := _bal.company_id::text || ':' || _bal.sku_id::text || ':' || _bal.warehouse_id::text
      || ':' || COALESCE(_bal.location_id::text,'') || ':' || _bal.disposition
      || ':' || COALESCE(_bal.lot_id::text,'') || ':' || COALESCE(_bal.serial_id::text,'');
    PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

    INSERT INTO public.inventory_balances
      (company_id, sku_id, warehouse_id, location_id, disposition, lot_id, serial_id, quantity, version)
    VALUES (_bal.company_id, _bal.sku_id, _bal.warehouse_id, _bal.location_id, _bal.disposition,
            _bal.lot_id, _bal.serial_id, 0, 0)
    ON CONFLICT (company_id, sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)
      DO NOTHING;

    UPDATE public.inventory_balances
       SET quantity = quantity + _bal.delta,
           version = version + 1,
           updated_at = now()
     WHERE company_id = _bal.company_id
       AND sku_id = _bal.sku_id
       AND warehouse_id = _bal.warehouse_id
       AND location_id IS NOT DISTINCT FROM _bal.location_id
       AND disposition = _bal.disposition
       AND lot_id IS NOT DISTINCT FROM _bal.lot_id
       AND serial_id IS NOT DISTINCT FROM _bal.serial_id
    RETURNING quantity INTO _new_qty;

    IF _new_qty < 0 THEN
      RAISE EXCEPTION 'inventory would go negative for sku %', _bal.sku_id;
    END IF;
    IF _bal.serial_id IS NOT NULL AND _new_qty > 1 THEN
      RAISE EXCEPTION 'serial % cannot exceed quantity 1 in one balance', _bal.serial_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'transaction_id', _tx_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid) TO authenticated;

-- =========================================================================
-- reverse_inventory_transaction
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reverse_inventory_transaction(_tx_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _orig public.inventory_transactions%ROWTYPE;
  _entries jsonb;
  _res jsonb;
  _new_id uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _orig FROM public.inventory_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found'; END IF;
  IF _orig.status = 'reversed' THEN RAISE EXCEPTION 'already reversed'; END IF;
  IF NOT public.company_member_has_permission(_orig.company_id, _actor, 'inventory.reverse') THEN
    RAISE EXCEPTION 'inventory.reverse required' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'sku_id', sku_id, 'warehouse_id', warehouse_id,
    'location_id', location_id, 'disposition', disposition,
    'lot_id', lot_id, 'serial_id', serial_id,
    'quantity', -quantity
  )) INTO _entries
  FROM public.inventory_transaction_entries WHERE transaction_id = _tx_id;

  _res := public.post_inventory_transaction(
    _orig.company_id, 'reversal', _entries,
    'reversal', _tx_id, NULL,
    jsonb_build_object('note', _note), _tx_id);
  _new_id := (_res->>'transaction_id')::uuid;

  UPDATE public.inventory_transactions
    SET status = 'reversed', reversed_at = now(), reversed_by = _new_id
    WHERE id = _tx_id;

  RETURN jsonb_build_object('ok', true, 'reversal_transaction_id', _new_id, 'original', _tx_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid,text) TO authenticated;

-- =========================================================================
-- rebuild_inventory_balances (reconciliation)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rebuild_inventory_balances(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _actor uuid := auth.uid(); _rows int;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.company_member_has_permission(_company_id, _actor, 'inventory.adjust') THEN
    RAISE EXCEPTION 'inventory.adjust required' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.inventory_balances WHERE company_id = _company_id;
  INSERT INTO public.inventory_balances
    (company_id, sku_id, warehouse_id, location_id, disposition, lot_id, serial_id, quantity, version)
  SELECT company_id, sku_id, warehouse_id, location_id, disposition, lot_id, serial_id,
         SUM(quantity)::int, 1
    FROM public.inventory_transaction_entries e
   WHERE company_id = _company_id
   GROUP BY 1,2,3,4,5,6,7
  HAVING SUM(quantity) > 0;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'rows', _rows);
END $$;
REVOKE EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) TO authenticated;

-- =========================================================================
-- sku_sellable_quantity (read helper)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.sku_sellable_quantity(_company_id uuid, _sku_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _q int;
BEGIN
  IF NOT public.is_company_member(_company_id, auth.uid()) THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(quantity),0)::int INTO _q FROM public.inventory_balances
    WHERE company_id = _company_id AND sku_id = _sku_id AND disposition = 'sellable';
  RETURN _q;
END $$;
REVOKE EXECUTE ON FUNCTION public.sku_sellable_quantity(uuid,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sku_sellable_quantity(uuid,uuid) TO authenticated;