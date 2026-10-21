
-- Allow pack/ship/reverse_pack when reservation is active or fully_consumed
CREATE OR REPLACE FUNCTION public.pack_reservation_allocation(
  _allocation_id uuid, _quantity int, _idempotency_key text DEFAULT NULL,
  _lot_id uuid DEFAULT NULL, _serial_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _pickable int; _entries jsonb; _tx jsonb; _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;
  SELECT * INTO _alloc FROM public.inventory_reservation_allocations WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;
  SELECT * INTO _line FROM public.inventory_reservation_lines WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr  FROM public.inventory_reservation_headers WHERE id = _line.reservation_id FOR UPDATE;

  IF _hdr.status NOT IN ('active','fully_consumed') THEN
    RAISE EXCEPTION 'cannot pack: reservation status=%', _hdr.status;
  END IF;
  IF NOT public.company_member_has_permission(_hdr.company_id, _actor, 'fulfilment.pack') THEN
    RAISE EXCEPTION 'permission fulfilment.pack required' USING ERRCODE='42501';
  END IF;

  _lock_key := 'resv:' || _hdr.company_id::text || ':' || _line.sku_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

  _pickable := _alloc.consumed_quantity - _alloc.packed_quantity;
  IF _quantity > _pickable THEN
    RAISE EXCEPTION 'quantity % exceeds packable (picked-not-yet-packed) %', _quantity, _pickable;
  END IF;

  _entries := jsonb_build_array(
    jsonb_build_object('sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','picked',
      'lot_id',_lot_id,'serial_id',_serial_id,'quantity',-_quantity),
    jsonb_build_object('sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','packed_or_staging',
      'lot_id',_lot_id,'serial_id',_serial_id,'quantity',_quantity));

  _tx := public.post_inventory_transaction(
    _hdr.company_id,'pack',_entries,'reservation_allocation',_alloc.id,_idempotency_key,
    jsonb_build_object('reservation_id',_hdr.id,'line_id',_line.id,'stage','pack'), NULL);

  IF COALESCE((_tx->>'idempotent_replay')::boolean,false) THEN
    RETURN jsonb_build_object('ok',true,'idempotent_replay',true,
      'transaction_id',_tx->>'transaction_id','allocation_id',_alloc.id);
  END IF;

  UPDATE public.inventory_reservation_allocations
    SET packed_quantity = packed_quantity + _quantity, updated_at = now() WHERE id = _alloc.id;
  UPDATE public.inventory_reservation_lines
    SET packed_quantity = packed_quantity + _quantity, updated_at = now() WHERE id = _line.id;

  RETURN jsonb_build_object('ok',true,'transaction_id',_tx->>'transaction_id',
    'allocation_id',_alloc.id,'quantity',_quantity);
END $$;

CREATE OR REPLACE FUNCTION public.ship_reservation_allocation(
  _allocation_id uuid, _quantity int, _idempotency_key text DEFAULT NULL,
  _lot_id uuid DEFAULT NULL, _serial_id uuid DEFAULT NULL,
  _carrier text DEFAULT NULL, _tracking_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _shippable int; _entries jsonb; _tx jsonb; _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;
  SELECT * INTO _alloc FROM public.inventory_reservation_allocations WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;
  SELECT * INTO _line FROM public.inventory_reservation_lines WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr  FROM public.inventory_reservation_headers WHERE id = _line.reservation_id FOR UPDATE;

  IF _hdr.status = 'cancelled' THEN RAISE EXCEPTION 'cannot ship: reservation is cancelled'; END IF;
  IF _hdr.status = 'fully_released' THEN RAISE EXCEPTION 'cannot ship: reservation fully released'; END IF;
  IF NOT public.company_member_has_permission(_hdr.company_id, _actor, 'fulfilment.ship') THEN
    RAISE EXCEPTION 'permission fulfilment.ship required' USING ERRCODE='42501';
  END IF;

  _lock_key := 'resv:' || _hdr.company_id::text || ':' || _line.sku_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

  _shippable := _alloc.packed_quantity - _alloc.shipped_quantity;
  IF _quantity > _shippable THEN
    RAISE EXCEPTION 'quantity % exceeds shippable (packed-not-yet-shipped) %', _quantity, _shippable;
  END IF;

  _entries := jsonb_build_array(
    jsonb_build_object('sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','packed_or_staging',
      'lot_id',_lot_id,'serial_id',_serial_id,'quantity',-_quantity));

  _tx := public.post_inventory_transaction(
    _hdr.company_id,'ship',_entries,'reservation_allocation',_alloc.id,_idempotency_key,
    jsonb_build_object('reservation_id',_hdr.id,'line_id',_line.id,'stage','ship',
      'carrier',_carrier,'tracking_code',_tracking_code), NULL);

  IF COALESCE((_tx->>'idempotent_replay')::boolean,false) THEN
    RETURN jsonb_build_object('ok',true,'idempotent_replay',true,
      'transaction_id',_tx->>'transaction_id','allocation_id',_alloc.id);
  END IF;

  UPDATE public.inventory_reservation_allocations
    SET shipped_quantity = shipped_quantity + _quantity, updated_at = now() WHERE id = _alloc.id;
  UPDATE public.inventory_reservation_lines
    SET shipped_quantity = shipped_quantity + _quantity, updated_at = now() WHERE id = _line.id;

  RETURN jsonb_build_object('ok',true,'transaction_id',_tx->>'transaction_id',
    'allocation_id',_alloc.id,'quantity',_quantity);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_pack_allocation(
  _allocation_id uuid, _quantity int, _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _reversible int; _entries jsonb; _tx jsonb; _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;
  SELECT * INTO _alloc FROM public.inventory_reservation_allocations WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;
  SELECT * INTO _line FROM public.inventory_reservation_lines WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr  FROM public.inventory_reservation_headers WHERE id = _line.reservation_id FOR UPDATE;

  IF _hdr.status NOT IN ('active','fully_consumed') THEN
    RAISE EXCEPTION 'cannot reverse pack: reservation status=%', _hdr.status;
  END IF;
  IF NOT public.company_member_has_permission(_hdr.company_id, _actor, 'fulfilment.pack') THEN
    RAISE EXCEPTION 'permission fulfilment.pack required' USING ERRCODE='42501';
  END IF;

  _lock_key := 'resv:' || _hdr.company_id::text || ':' || _line.sku_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

  _reversible := _alloc.packed_quantity - _alloc.shipped_quantity;
  IF _quantity > _reversible THEN
    RAISE EXCEPTION 'quantity % exceeds reversible packed (not yet shipped) %', _quantity, _reversible;
  END IF;

  _entries := jsonb_build_array(
    jsonb_build_object('sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','packed_or_staging','quantity',-_quantity),
    jsonb_build_object('sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','picked','quantity',_quantity));

  _tx := public.post_inventory_transaction(
    _hdr.company_id,'pack_reversal',_entries,'reservation_allocation',_alloc.id,_idempotency_key,
    jsonb_build_object('reservation_id',_hdr.id,'line_id',_line.id,'stage','pack_reversal'), NULL);

  IF COALESCE((_tx->>'idempotent_replay')::boolean,false) THEN
    RETURN jsonb_build_object('ok',true,'idempotent_replay',true,'transaction_id',_tx->>'transaction_id');
  END IF;

  UPDATE public.inventory_reservation_allocations
    SET packed_quantity = packed_quantity - _quantity, updated_at = now() WHERE id = _alloc.id;
  UPDATE public.inventory_reservation_lines
    SET packed_quantity = packed_quantity - _quantity, updated_at = now() WHERE id = _line.id;

  RETURN jsonb_build_object('ok',true,'transaction_id',_tx->>'transaction_id','quantity',_quantity);
END $$;

REVOKE EXECUTE ON FUNCTION
  public.pack_reservation_allocation(uuid,int,text,uuid,uuid),
  public.ship_reservation_allocation(uuid,int,text,uuid,uuid,text,text),
  public.reverse_pack_allocation(uuid,int,text)
FROM anon;

-- Grant channels.connect to the Owner role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.system_company_roles r
CROSS JOIN public.permissions p
WHERE r.key = 'owner' AND p.key = 'channels.connect'
ON CONFLICT DO NOTHING;
