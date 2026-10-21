
-- pack_reservation_allocation: idempotent replay short-circuit
CREATE OR REPLACE FUNCTION public.pack_reservation_allocation(_allocation_id uuid, _quantity integer, _idempotency_key text DEFAULT NULL::text, _lot_id uuid DEFAULT NULL::uuid, _serial_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _pickable int; _entries jsonb; _tx jsonb; _lock_key text;
  _existing_tx uuid;
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

  -- Idempotent replay short-circuit BEFORE capacity check.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing_tx FROM public.inventory_transactions
      WHERE company_id = _hdr.company_id AND idempotency_key = _idempotency_key;
    IF _existing_tx IS NOT NULL THEN
      RETURN jsonb_build_object('ok',true,'idempotent_replay',true,
        'transaction_id',_existing_tx,'allocation_id',_alloc.id);
    END IF;
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
END $function$;

-- ship_reservation_allocation: idempotent replay short-circuit
CREATE OR REPLACE FUNCTION public.ship_reservation_allocation(_allocation_id uuid, _quantity integer, _idempotency_key text DEFAULT NULL::text, _lot_id uuid DEFAULT NULL::uuid, _serial_id uuid DEFAULT NULL::uuid, _carrier text DEFAULT NULL::text, _tracking_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _shippable int; _entries jsonb; _tx jsonb; _lock_key text;
  _existing_tx uuid;
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

  -- Idempotent replay short-circuit BEFORE capacity check.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing_tx FROM public.inventory_transactions
      WHERE company_id = _hdr.company_id AND idempotency_key = _idempotency_key;
    IF _existing_tx IS NOT NULL THEN
      RETURN jsonb_build_object('ok',true,'idempotent_replay',true,
        'transaction_id',_existing_tx,'allocation_id',_alloc.id);
    END IF;
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
END $function$;

-- set_channel_published_quantity: replace 40001 with P0001 to prevent PostgREST retries.
CREATE OR REPLACE FUNCTION public.set_channel_published_quantity(_listing_id uuid, _new_quantity integer, _reason text, _expected_version bigint DEFAULT NULL::bigint, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _l public.channel_listings%ROWTYPE;
  _new_version bigint;
  _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _new_quantity IS NULL OR _new_quantity < 0 THEN
    RAISE EXCEPTION 'new_quantity must be >= 0';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO _l FROM public.channel_listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;

  IF NOT public.company_member_has_permission(_l.company_id, _actor, 'listings.manage') THEN
    RAISE EXCEPTION 'permission listings.manage required' USING ERRCODE = '42501';
  END IF;

  _lock_key := 'chpub:' || _l.id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

  IF _expected_version IS NOT NULL AND _expected_version <> _l.published_version THEN
    RAISE EXCEPTION 'version conflict: expected %, current %',
      _expected_version, _l.published_version USING ERRCODE = 'P0001';
  END IF;

  IF _l.channel_cap IS NOT NULL AND _new_quantity > _l.channel_cap THEN
    RAISE EXCEPTION 'new_quantity % exceeds channel_cap %', _new_quantity, _l.channel_cap;
  END IF;

  _new_version := _l.published_version + 1;

  UPDATE public.channel_listings
     SET published_quantity = _new_quantity,
         published_version  = _new_version,
         last_published_at  = now(),
         updated_at         = now()
   WHERE id = _l.id;

  INSERT INTO public.channel_listing_audit
    (company_id, listing_id, actor_user_id,
     from_quantity, to_quantity, from_version, to_version, reason, metadata)
  VALUES
    (_l.company_id, _l.id, _actor,
     _l.published_quantity, _new_quantity,
     _l.published_version, _new_version, _reason, COALESCE(_metadata,'{}'::jsonb));

  RETURN jsonb_build_object(
    'ok', true,
    'listing_id', _l.id,
    'from_quantity', _l.published_quantity,
    'to_quantity', _new_quantity,
    'to_version', _new_version);
END $function$;
