
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
  _is_service boolean := (session_user::text = 'service_role');
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
  IF NOT _is_service THEN
    IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF NOT public.is_company_member(_company_id, _actor) THEN
      RAISE EXCEPTION 'not a member of company %', _company_id;
    END IF;
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
  IF NOT _is_service THEN
    IF NOT public.company_member_has_permission(_company_id, _actor, _perm) THEN
      RAISE EXCEPTION 'permission % required', _perm USING ERRCODE='42501';
    END IF;
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
