
-- =========================================================================
-- Phase 3 — Migration 1: Transactional Outbox + channel_listings lockdown
-- Charter Revision 3 (approved). Same-transaction outbox writes only.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. channel_listings lockdown
-- -------------------------------------------------------------------------
-- Table-level REVOKE is required: column-level REVOKE alone does not block
-- writes when table-level UPDATE is granted. The only path to modify
-- published_quantity / published_version is set_channel_published_quantity
-- (SECURITY DEFINER), which bypasses this restriction by design.
REVOKE UPDATE ON public.channel_listings FROM authenticated;
REVOKE UPDATE ON public.channel_listings FROM anon;
-- Intentionally NOT re-granting UPDATE on any column. All legitimate
-- updates route through SECURITY DEFINER RPCs.

-- -------------------------------------------------------------------------
-- 2. outbox_events
-- -------------------------------------------------------------------------
CREATE TABLE public.outbox_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id  uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  listing_id          uuid NOT NULL REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  sku_id              uuid REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  event_type          text NOT NULL,
  listing_version     bigint NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'pending',
  attempts            int NOT NULL DEFAULT 0,
  max_attempts        int NOT NULL DEFAULT 8,
  claim_token         uuid,
  claimed_at          timestamptz,
  lease_expires_at    timestamptz,
  next_attempt_at     timestamptz,
  last_error          text,
  delivered_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_status_ck CHECK (
    status IN ('pending','in_flight','failed','delivered','superseded','dead_letter')
  ),
  CONSTRAINT outbox_events_version_ck  CHECK (listing_version >= 0),
  CONSTRAINT outbox_events_attempts_ck CHECK (attempts >= 0),
  CONSTRAINT outbox_events_max_attempts_ck CHECK (max_attempts >= 1),
  CONSTRAINT outbox_events_event_type_ck CHECK (length(btrim(event_type)) > 0),
  -- delivered_at is set iff status='delivered' (invariant enforced by guard)
  CONSTRAINT outbox_events_delivered_shape_ck CHECK (
    (status = 'delivered' AND delivered_at IS NOT NULL)
    OR (status <> 'delivered' AND delivered_at IS NULL)
  ),
  -- in_flight requires an active claim
  CONSTRAINT outbox_events_in_flight_shape_ck CHECK (
    (status = 'in_flight'
       AND claim_token IS NOT NULL
       AND claimed_at IS NOT NULL
       AND lease_expires_at IS NOT NULL)
    OR (status <> 'in_flight')
  )
);

-- Indexes
CREATE INDEX outbox_events_company_idx
  ON public.outbox_events (company_id);
CREATE INDEX outbox_events_listing_idx
  ON public.outbox_events (listing_id, listing_version DESC);
-- Dispatcher lookup: pending / failed events ready to attempt
CREATE INDEX outbox_events_dispatch_idx
  ON public.outbox_events (channel_account_id, next_attempt_at NULLS FIRST, created_at, id)
  WHERE status IN ('pending','failed');
-- Monotonic version lookup for delivered/superseded gate (Charter §4.b.i)
CREATE INDEX outbox_events_last_delivered_idx
  ON public.outbox_events (listing_id, listing_version DESC)
  WHERE status = 'delivered';
-- Charter §4.b.ii: at most one in_flight event per listing
CREATE UNIQUE INDEX outbox_events_one_in_flight_per_listing
  ON public.outbox_events (listing_id)
  WHERE status = 'in_flight';

-- GRANTs (SELECT for members via RLS; no direct writes for anyone)
GRANT SELECT ON public.outbox_events TO authenticated;
GRANT ALL    ON public.outbox_events TO service_role;
-- anon: no grants

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY outbox_events_select ON public.outbox_events
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

-- No INSERT/UPDATE/DELETE policies for authenticated: writes only happen via
-- SECURITY DEFINER functions (enqueue_outbox_event, claim/complete/fail — M2).

-- -------------------------------------------------------------------------
-- 3. Append-only + field-scoped update guard
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._outbox_events_delete_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'outbox_events is append-only';
END $$;

CREATE OR REPLACE FUNCTION public._outbox_events_update_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Immutable identity + payload columns
  IF NEW.id                 IS DISTINCT FROM OLD.id
  OR NEW.company_id         IS DISTINCT FROM OLD.company_id
  OR NEW.channel_account_id IS DISTINCT FROM OLD.channel_account_id
  OR NEW.listing_id         IS DISTINCT FROM OLD.listing_id
  OR NEW.sku_id             IS DISTINCT FROM OLD.sku_id
  OR NEW.event_type         IS DISTINCT FROM OLD.event_type
  OR NEW.listing_version    IS DISTINCT FROM OLD.listing_version
  OR NEW.payload            IS DISTINCT FROM OLD.payload
  OR NEW.max_attempts       IS DISTINCT FROM OLD.max_attempts
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outbox_events: immutable field changed';
  END IF;

  -- Terminal statuses (delivered / dead_letter / superseded) are final.
  IF OLD.status IN ('delivered','dead_letter','superseded')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'outbox_events: status % is terminal', OLD.status;
  END IF;

  -- Attempts is monotonically non-decreasing.
  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'outbox_events: attempts cannot decrease';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER outbox_events_no_delete
  BEFORE DELETE ON public.outbox_events
  FOR EACH ROW EXECUTE FUNCTION public._outbox_events_delete_guard();

CREATE TRIGGER outbox_events_update_guard
  BEFORE UPDATE ON public.outbox_events
  FOR EACH ROW EXECUTE FUNCTION public._outbox_events_update_guard();

-- -------------------------------------------------------------------------
-- 4. outbox_dead_letters (append-only mirror of terminal failures)
-- -------------------------------------------------------------------------
CREATE TABLE public.outbox_dead_letters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL UNIQUE REFERENCES public.outbox_events(id) ON DELETE RESTRICT,
  company_id          uuid NOT NULL,
  channel_account_id  uuid NOT NULL,
  listing_id          uuid NOT NULL,
  listing_version     bigint NOT NULL,
  attempts            int NOT NULL,
  reason              text NOT NULL,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_dead_letters_company_idx
  ON public.outbox_dead_letters (company_id, created_at DESC);

GRANT SELECT ON public.outbox_dead_letters TO authenticated;
GRANT ALL    ON public.outbox_dead_letters TO service_role;

ALTER TABLE public.outbox_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY outbox_dead_letters_select ON public.outbox_dead_letters
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

CREATE OR REPLACE FUNCTION public._outbox_dead_letters_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'outbox_dead_letters is append-only';
END $$;

CREATE TRIGGER outbox_dead_letters_no_update
  BEFORE UPDATE ON public.outbox_dead_letters
  FOR EACH ROW EXECUTE FUNCTION public._outbox_dead_letters_immutable();

CREATE TRIGGER outbox_dead_letters_no_delete
  BEFORE DELETE ON public.outbox_dead_letters
  FOR EACH ROW EXECUTE FUNCTION public._outbox_dead_letters_immutable();

-- -------------------------------------------------------------------------
-- 5. enqueue_outbox_event — called only from other SECURITY DEFINER functions
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_outbox_event(
  _listing_id      uuid,
  _listing_version bigint,
  _event_type      text,
  _payload         jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _l public.channel_listings%ROWTYPE;
  _event_id uuid;
BEGIN
  IF _listing_id IS NULL THEN RAISE EXCEPTION 'listing_id required'; END IF;
  IF _listing_version IS NULL OR _listing_version < 0 THEN
    RAISE EXCEPTION 'listing_version must be >= 0';
  END IF;
  IF _event_type IS NULL OR length(btrim(_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type required';
  END IF;

  SELECT * INTO _l FROM public.channel_listings WHERE id = _listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing % not found', _listing_id; END IF;

  INSERT INTO public.outbox_events
    (company_id, channel_account_id, listing_id, sku_id,
     event_type, listing_version, payload, status, next_attempt_at)
  VALUES
    (_l.company_id, _l.channel_account_id, _l.id, _l.sku_id,
     _event_type, _listing_version, COALESCE(_payload,'{}'::jsonb),
     'pending', now())
  RETURNING id INTO _event_id;

  RETURN _event_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.enqueue_outbox_event(uuid,bigint,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbox_event(uuid,bigint,text,jsonb)
  TO service_role;

-- -------------------------------------------------------------------------
-- 6. set_channel_published_quantity — atomic outbox enqueue
--    Preserves EXACTLY the Phase 2 M4 output shape and OCC (P0001) behavior.
--    Only change: single PERFORM enqueue_outbox_event(...) inside the same tx.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_channel_published_quantity(
  _listing_id uuid,
  _new_quantity integer,
  _reason text,
  _expected_version bigint DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Phase 3 M1: atomic outbox enqueue with snapshot listing_version.
  PERFORM public.enqueue_outbox_event(
    _l.id,
    _new_version,
    'listing.publish_quantity',
    jsonb_build_object(
      'from_quantity', _l.published_quantity,
      'to_quantity',   _new_quantity,
      'from_version',  _l.published_version,
      'to_version',    _new_version,
      'reason',        _reason,
      'metadata',      COALESCE(_metadata,'{}'::jsonb)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'listing_id', _l.id,
    'from_quantity', _l.published_quantity,
    'to_quantity', _new_quantity,
    'to_version', _new_version);
END $$;

-- Preserve existing grants on set_channel_published_quantity (authenticated).
