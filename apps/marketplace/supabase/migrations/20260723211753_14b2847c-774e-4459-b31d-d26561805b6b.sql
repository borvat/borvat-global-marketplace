
-- ============================================================
-- Phase 2 — Migration 4: Fulfilment (pack/ship) + Channels
-- Per Architecture §21.2/§21.4 and Migration 4 acceptance criteria.
-- ============================================================

-- ---------- 1. Reservation allocation state: pack / ship ----------

ALTER TABLE public.inventory_reservation_allocations
  ADD COLUMN IF NOT EXISTS packed_quantity  int NOT NULL DEFAULT 0 CHECK (packed_quantity  >= 0),
  ADD COLUMN IF NOT EXISTS shipped_quantity int NOT NULL DEFAULT 0 CHECK (shipped_quantity >= 0);

ALTER TABLE public.inventory_reservation_lines
  ADD COLUMN IF NOT EXISTS packed_quantity  int NOT NULL DEFAULT 0 CHECK (packed_quantity  >= 0),
  ADD COLUMN IF NOT EXISTS shipped_quantity int NOT NULL DEFAULT 0 CHECK (shipped_quantity >= 0);

-- Ordering invariants: shipped ≤ packed ≤ consumed (picked); released path is independent.
ALTER TABLE public.inventory_reservation_allocations
  DROP CONSTRAINT IF EXISTS ira_pack_ship_order,
  ADD  CONSTRAINT ira_pack_ship_order
    CHECK (shipped_quantity <= packed_quantity
       AND packed_quantity  <= consumed_quantity);

ALTER TABLE public.inventory_reservation_lines
  DROP CONSTRAINT IF EXISTS irl_pack_ship_order,
  ADD  CONSTRAINT irl_pack_ship_order
    CHECK (shipped_quantity <= packed_quantity
       AND packed_quantity  <= consumed_quantity);

-- ---------- 2. Pack RPC ----------
CREATE OR REPLACE FUNCTION public.pack_reservation_allocation(
  _allocation_id uuid,
  _quantity int,
  _idempotency_key text DEFAULT NULL,
  _lot_id uuid DEFAULT NULL,
  _serial_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _pickable int;
  _entries jsonb;
  _tx jsonb;
  _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;

  SELECT * INTO _alloc FROM public.inventory_reservation_allocations
    WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;
  SELECT * INTO _line FROM public.inventory_reservation_lines
    WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr  FROM public.inventory_reservation_headers
    WHERE id = _line.reservation_id FOR UPDATE;

  IF _hdr.status <> 'active' THEN
    RAISE EXCEPTION 'reservation not active (status=%)', _hdr.status;
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
    jsonb_build_object(
      'sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','picked',
      'lot_id',_lot_id,'serial_id',_serial_id,'quantity',-_quantity),
    jsonb_build_object(
      'sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','packed_or_staging',
      'lot_id',_lot_id,'serial_id',_serial_id,'quantity',_quantity));

  _tx := public.post_inventory_transaction(
    _hdr.company_id,'pack',_entries,
    'reservation_allocation',_alloc.id,_idempotency_key,
    jsonb_build_object('reservation_id',_hdr.id,'line_id',_line.id,'stage','pack'),
    NULL);

  IF COALESCE((_tx->>'idempotent_replay')::boolean,false) THEN
    RETURN jsonb_build_object('ok',true,'idempotent_replay',true,
      'transaction_id',_tx->>'transaction_id','allocation_id',_alloc.id);
  END IF;

  UPDATE public.inventory_reservation_allocations
    SET packed_quantity = packed_quantity + _quantity, updated_at = now()
    WHERE id = _alloc.id;
  UPDATE public.inventory_reservation_lines
    SET packed_quantity = packed_quantity + _quantity, updated_at = now()
    WHERE id = _line.id;

  RETURN jsonb_build_object('ok',true,'transaction_id',_tx->>'transaction_id',
    'allocation_id',_alloc.id,'quantity',_quantity);
END $$;

-- ---------- 3. Ship RPC (non-conserving external issue) ----------
CREATE OR REPLACE FUNCTION public.ship_reservation_allocation(
  _allocation_id uuid,
  _quantity int,
  _idempotency_key text DEFAULT NULL,
  _lot_id uuid DEFAULT NULL,
  _serial_id uuid DEFAULT NULL,
  _carrier text DEFAULT NULL,
  _tracking_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _shippable int;
  _entries jsonb;
  _tx jsonb;
  _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;

  SELECT * INTO _alloc FROM public.inventory_reservation_allocations
    WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;
  SELECT * INTO _line FROM public.inventory_reservation_lines
    WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr  FROM public.inventory_reservation_headers
    WHERE id = _line.reservation_id FOR UPDATE;

  IF _hdr.status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot ship: reservation is cancelled';
  END IF;
  IF _hdr.status = 'fully_released' THEN
    RAISE EXCEPTION 'cannot ship: reservation fully released';
  END IF;
  IF NOT public.company_member_has_permission(_hdr.company_id, _actor, 'fulfilment.ship') THEN
    RAISE EXCEPTION 'permission fulfilment.ship required' USING ERRCODE='42501';
  END IF;

  _lock_key := 'resv:' || _hdr.company_id::text || ':' || _line.sku_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(_lock_key, 0));

  _shippable := _alloc.packed_quantity - _alloc.shipped_quantity;
  IF _quantity > _shippable THEN
    RAISE EXCEPTION 'quantity % exceeds shippable (packed-not-yet-shipped) %', _quantity, _shippable;
  END IF;

  -- Non-conserving: single negative entry from packed_or_staging (external issue).
  _entries := jsonb_build_array(
    jsonb_build_object(
      'sku_id',_line.sku_id,'warehouse_id',_alloc.warehouse_id,
      'location_id',_alloc.location_id,'disposition','packed_or_staging',
      'lot_id',_lot_id,'serial_id',_serial_id,'quantity',-_quantity));

  _tx := public.post_inventory_transaction(
    _hdr.company_id,'ship',_entries,
    'reservation_allocation',_alloc.id,_idempotency_key,
    jsonb_build_object(
      'reservation_id',_hdr.id,'line_id',_line.id,'stage','ship',
      'carrier',_carrier,'tracking_code',_tracking_code),
    NULL);

  IF COALESCE((_tx->>'idempotent_replay')::boolean,false) THEN
    RETURN jsonb_build_object('ok',true,'idempotent_replay',true,
      'transaction_id',_tx->>'transaction_id','allocation_id',_alloc.id);
  END IF;

  UPDATE public.inventory_reservation_allocations
    SET shipped_quantity = shipped_quantity + _quantity, updated_at = now()
    WHERE id = _alloc.id;
  UPDATE public.inventory_reservation_lines
    SET shipped_quantity = shipped_quantity + _quantity, updated_at = now()
    WHERE id = _line.id;

  RETURN jsonb_build_object('ok',true,'transaction_id',_tx->>'transaction_id',
    'allocation_id',_alloc.id,'quantity',_quantity);
END $$;

-- ---------- 4. Pack reversal (packed → picked) ----------
CREATE OR REPLACE FUNCTION public.reverse_pack_allocation(
  _allocation_id uuid,
  _quantity int,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _alloc public.inventory_reservation_allocations%ROWTYPE;
  _line  public.inventory_reservation_lines%ROWTYPE;
  _hdr   public.inventory_reservation_headers%ROWTYPE;
  _reversible int;
  _entries jsonb; _tx jsonb; _lock_key text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'quantity must be > 0'; END IF;

  SELECT * INTO _alloc FROM public.inventory_reservation_allocations WHERE id = _allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation not found'; END IF;
  SELECT * INTO _line FROM public.inventory_reservation_lines WHERE id = _alloc.line_id FOR UPDATE;
  SELECT * INTO _hdr  FROM public.inventory_reservation_headers WHERE id = _line.reservation_id FOR UPDATE;

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
    _hdr.company_id,'pack_reversal',_entries,
    'reservation_allocation',_alloc.id,_idempotency_key,
    jsonb_build_object('reservation_id',_hdr.id,'line_id',_line.id,'stage','pack_reversal'),
    NULL);

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
GRANT EXECUTE ON FUNCTION
  public.pack_reservation_allocation(uuid,int,text,uuid,uuid),
  public.ship_reservation_allocation(uuid,int,text,uuid,uuid,text,text),
  public.reverse_pack_allocation(uuid,int,text)
TO authenticated;

-- ============================================================
-- 5. Channels: accounts + listings + audit
-- ============================================================

CREATE TYPE public.p2_channel_control_state AS ENUM
  ('read_only_import','shadow','active','paused');

-- 5a. channel_accounts
CREATE TABLE public.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  external_account_id text,
  display_name text NOT NULL,
  control_state public.p2_channel_control_state NOT NULL DEFAULT 'read_only_import',
  status public.p2_lifecycle_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, external_account_id)
);
GRANT SELECT, INSERT, UPDATE ON public.channel_accounts TO authenticated;
GRANT ALL ON public.channel_accounts TO service_role;
ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_accounts_select ON public.channel_accounts
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));
CREATE POLICY channel_accounts_insert ON public.channel_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'channels.connect'));
CREATE POLICY channel_accounts_update ON public.channel_accounts
  FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.connect'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'channels.connect'));

CREATE TRIGGER channel_accounts_immutable_company_id
  BEFORE UPDATE ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();
CREATE TRIGGER channel_accounts_touch
  BEFORE UPDATE ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add channels.connect permission if missing
INSERT INTO public.permissions (key, description)
VALUES ('channels.connect','Connect a channel account for a company')
ON CONFLICT (key) DO NOTHING;

-- 5b. channel_listings — published quantity is EXPLICITLY separate from inventory & reservations
CREATE TABLE public.channel_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  sku_id uuid REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  offer_id uuid REFERENCES public.catalog_offers(id) ON DELETE RESTRICT,
  external_listing_id text,
  units_per_offer int NOT NULL DEFAULT 1 CHECK (units_per_offer > 0),
  channel_cap int CHECK (channel_cap IS NULL OR channel_cap >= 0),
  control_state public.p2_channel_control_state NOT NULL DEFAULT 'read_only_import',
  published_quantity int NOT NULL DEFAULT 0 CHECK (published_quantity >= 0),
  published_version bigint NOT NULL DEFAULT 0,
  last_published_at timestamptz,
  status public.p2_lifecycle_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((sku_id IS NOT NULL) <> (offer_id IS NOT NULL)),
  UNIQUE (channel_account_id, external_listing_id)
);
CREATE INDEX channel_listings_company_idx ON public.channel_listings(company_id);
CREATE INDEX channel_listings_account_idx ON public.channel_listings(channel_account_id);

GRANT SELECT, INSERT, UPDATE ON public.channel_listings TO authenticated;
GRANT ALL ON public.channel_listings TO service_role;
ALTER TABLE public.channel_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_listings_select ON public.channel_listings
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));
CREATE POLICY channel_listings_insert ON public.channel_listings
  FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'listings.manage'));
CREATE POLICY channel_listings_update ON public.channel_listings
  FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'listings.manage'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'listings.manage'));

CREATE TRIGGER channel_listings_immutable_company_id
  BEFORE UPDATE ON public.channel_listings
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();
CREATE TRIGGER channel_listings_touch
  BEFORE UPDATE ON public.channel_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cross-table guard: channel_account must belong to same company
CREATE OR REPLACE FUNCTION public._channel_listings_validate_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _acc_company uuid; _sku_company uuid; _offer_company uuid;
BEGIN
  SELECT company_id INTO _acc_company FROM public.channel_accounts WHERE id = NEW.channel_account_id;
  IF _acc_company IS NULL OR _acc_company <> NEW.company_id THEN
    RAISE EXCEPTION 'channel_account_id % is not in company %', NEW.channel_account_id, NEW.company_id;
  END IF;
  IF NEW.sku_id IS NOT NULL THEN
    SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = NEW.sku_id;
    IF _sku_company IS NULL OR _sku_company <> NEW.company_id THEN
      RAISE EXCEPTION 'sku_id % is not in company %', NEW.sku_id, NEW.company_id;
    END IF;
  END IF;
  IF NEW.offer_id IS NOT NULL THEN
    SELECT company_id INTO _offer_company FROM public.catalog_offers WHERE id = NEW.offer_id;
    IF _offer_company IS NULL OR _offer_company <> NEW.company_id THEN
      RAISE EXCEPTION 'offer_id % is not in company %', NEW.offer_id, NEW.company_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channel_listings_validate_refs
  BEFORE INSERT OR UPDATE ON public.channel_listings
  FOR EACH ROW EXECUTE FUNCTION public._channel_listings_validate_refs();

-- 5c. channel_listing_audit — append-only trail for every published_quantity change
CREATE TABLE public.channel_listing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  listing_id uuid NOT NULL REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  from_quantity int NOT NULL,
  to_quantity int NOT NULL,
  from_version bigint NOT NULL,
  to_version bigint NOT NULL,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, to_version)
);
CREATE INDEX channel_listing_audit_listing_idx
  ON public.channel_listing_audit(listing_id, to_version DESC);

GRANT SELECT ON public.channel_listing_audit TO authenticated;
GRANT ALL   ON public.channel_listing_audit TO service_role;
ALTER TABLE public.channel_listing_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_listing_audit_select ON public.channel_listing_audit
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

-- Append-only: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION public._channel_listing_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'channel_listing_audit is append-only'; END $$;
CREATE TRIGGER channel_listing_audit_no_update
  BEFORE UPDATE OR DELETE ON public.channel_listing_audit
  FOR EACH ROW EXECUTE FUNCTION public._channel_listing_audit_immutable();

-- 5d. RPC — atomic, monotonic, audited quantity change
CREATE OR REPLACE FUNCTION public.set_channel_published_quantity(
  _listing_id uuid,
  _new_quantity int,
  _reason text,
  _expected_version bigint DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
      _expected_version, _l.published_version USING ERRCODE = '40001';
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
END $$;

REVOKE EXECUTE ON FUNCTION
  public.set_channel_published_quantity(uuid,int,text,bigint,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION
  public.set_channel_published_quantity(uuid,int,text,bigint,jsonb) TO authenticated;
