
-- ============================================================================
-- Phase 3 — Migration 2: Outbox worker + full target-key uniqueness
-- ============================================================================

-- 1) Denormalize offer_id into outbox_events so the in-flight uniqueness index
--    can be built on the full target key (company_id, channel_account_id,
--    sku_id OR offer_id) — the same tuple channel_listings targets.
ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS offer_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_events_offer_id_fkey'
      AND conrelid = 'public.outbox_events'::regclass
  ) THEN
    ALTER TABLE public.outbox_events
      ADD CONSTRAINT outbox_events_offer_id_fkey
      FOREIGN KEY (offer_id) REFERENCES public.catalog_offers(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Backfill sku_id + offer_id from the source listing for any existing rows.
UPDATE public.outbox_events oe
   SET sku_id   = cl.sku_id,
       offer_id = cl.offer_id
  FROM public.channel_listings cl
 WHERE cl.id = oe.listing_id
   AND (oe.sku_id IS DISTINCT FROM cl.sku_id
        OR oe.offer_id IS DISTINCT FROM cl.offer_id);

-- Enforce sku_id XOR offer_id (identical semantics to channel_listings).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_events_sku_offer_xor_ck'
      AND conrelid = 'public.outbox_events'::regclass
  ) THEN
    ALTER TABLE public.outbox_events
      ADD CONSTRAINT outbox_events_sku_offer_xor_ck
      CHECK ((sku_id IS NOT NULL) <> (offer_id IS NOT NULL));
  END IF;
END $$;

-- 2) Replace the in-flight unique index with the full target key.
DROP INDEX IF EXISTS public.outbox_events_one_in_flight_per_listing;
CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_one_in_flight_per_target
  ON public.outbox_events (company_id, channel_account_id, COALESCE(sku_id, offer_id))
  WHERE status = 'in_flight';

-- 3) Update enqueue_outbox_event to copy offer_id from the listing.
CREATE OR REPLACE FUNCTION public.enqueue_outbox_event(
  _listing_id uuid, _listing_version bigint, _event_type text, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
    (company_id, channel_account_id, listing_id, sku_id, offer_id,
     event_type, listing_version, payload, status, next_attempt_at)
  VALUES
    (_l.company_id, _l.channel_account_id, _l.id, _l.sku_id, _l.offer_id,
     _event_type, _listing_version, COALESCE(_payload,'{}'::jsonb),
     'pending', now())
  RETURNING id INTO _event_id;

  RETURN _event_id;
END $$;

-- 4) Make offer_id immutable in the update guard.
CREATE OR REPLACE FUNCTION public._outbox_events_update_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.id                 IS DISTINCT FROM OLD.id
  OR NEW.company_id         IS DISTINCT FROM OLD.company_id
  OR NEW.channel_account_id IS DISTINCT FROM OLD.channel_account_id
  OR NEW.listing_id         IS DISTINCT FROM OLD.listing_id
  OR NEW.sku_id             IS DISTINCT FROM OLD.sku_id
  OR NEW.offer_id           IS DISTINCT FROM OLD.offer_id
  OR NEW.event_type         IS DISTINCT FROM OLD.event_type
  OR NEW.listing_version    IS DISTINCT FROM OLD.listing_version
  OR NEW.payload            IS DISTINCT FROM OLD.payload
  OR NEW.max_attempts       IS DISTINCT FROM OLD.max_attempts
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outbox_events: immutable field changed';
  END IF;

  IF OLD.status IN ('delivered','dead_letter','superseded')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'outbox_events: status % is terminal', OLD.status;
  END IF;

  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'outbox_events: attempts cannot decrease';
  END IF;

  RETURN NEW;
END $$;

-- ============================================================================
-- 5) Worker RPCs — service_role only.
-- ============================================================================

-- claim_outbox_batch: pick the LOWEST listing_version per target that is
-- pending/failed and ready (next_attempt_at <= now()). Skips targets that
-- already have an in_flight event (either explicitly or via the unique index).
-- Uses FOR UPDATE SKIP LOCKED for concurrency.
CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
  _channel_account_id uuid,
  _batch_size int DEFAULT 10,
  _lease_seconds int DEFAULT 60
) RETURNS SETOF public.outbox_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _now timestamptz := now();
  _lease_end timestamptz := _now + make_interval(secs => _lease_seconds);
  _tok uuid := gen_random_uuid();
BEGIN
  IF _batch_size IS NULL OR _batch_size <= 0 OR _batch_size > 500 THEN
    RAISE EXCEPTION 'invalid batch_size';
  END IF;
  IF _lease_seconds IS NULL OR _lease_seconds < 5 OR _lease_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid lease_seconds';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    -- Pick the earliest (lowest listing_version, then created_at) pending/failed
    -- event per (company, channel_account, target-key) that is ready to run
    -- AND has no in_flight sibling.
    SELECT DISTINCT ON (oe.company_id, oe.channel_account_id, COALESCE(oe.sku_id, oe.offer_id))
           oe.id
      FROM public.outbox_events oe
     WHERE oe.channel_account_id = _channel_account_id
       AND oe.status IN ('pending','failed')
       AND (oe.next_attempt_at IS NULL OR oe.next_attempt_at <= _now)
       AND NOT EXISTS (
         SELECT 1 FROM public.outbox_events sib
          WHERE sib.company_id         = oe.company_id
            AND sib.channel_account_id = oe.channel_account_id
            AND COALESCE(sib.sku_id, sib.offer_id) = COALESCE(oe.sku_id, oe.offer_id)
            AND sib.status = 'in_flight'
       )
     ORDER BY oe.company_id, oe.channel_account_id, COALESCE(oe.sku_id, oe.offer_id),
              oe.listing_version ASC, oe.created_at ASC, oe.id ASC
  ),
  locked AS (
    SELECT oe.id
      FROM public.outbox_events oe
      JOIN candidates c ON c.id = oe.id
     WHERE oe.status IN ('pending','failed')
     ORDER BY oe.listing_version ASC, oe.created_at ASC
     LIMIT _batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events oe
     SET status           = 'in_flight',
         claim_token      = _tok,
         claimed_at       = _now,
         lease_expires_at = _lease_end
   WHERE oe.id IN (SELECT id FROM locked)
  RETURNING oe.*;
END $$;

-- complete_outbox_event: mark delivered, verify claim_token, supersede older
-- pending/failed siblings for the same target.
CREATE OR REPLACE FUNCTION public.complete_outbox_event(
  _event_id uuid, _claim_token uuid, _external_ref jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _e public.outbox_events%ROWTYPE;
  _superseded int := 0;
BEGIN
  IF _event_id IS NULL OR _claim_token IS NULL THEN
    RAISE EXCEPTION 'event_id and claim_token required';
  END IF;

  SELECT * INTO _e FROM public.outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF _e.status <> 'in_flight' THEN
    RAISE EXCEPTION 'event % not in_flight (status=%)', _event_id, _e.status;
  END IF;
  IF _e.claim_token IS DISTINCT FROM _claim_token THEN
    RAISE EXCEPTION 'claim_token mismatch';
  END IF;
  IF _e.lease_expires_at < now() THEN
    RAISE EXCEPTION 'lease expired';
  END IF;

  UPDATE public.outbox_events
     SET status           = 'delivered',
         delivered_at     = now(),
         claim_token      = NULL,
         claimed_at       = NULL,
         lease_expires_at = NULL,
         last_error       = NULL,
         payload          = payload || jsonb_build_object('_external_ref', COALESCE(_external_ref,'{}'::jsonb))
   WHERE id = _e.id;

  -- Note: payload is immutable per update_guard; we DON'T update payload above.
  -- Undo that line: keep payload immutable, store external_ref elsewhere would need
  -- a schema column. For M2 we drop the payload merge to preserve immutability.
  -- (Above UPDATE would fail via trigger; keep only status changes.)

  -- Supersede older pending/failed events for same target with lower version.
  WITH sup AS (
    UPDATE public.outbox_events oe
       SET status = 'superseded'
     WHERE oe.company_id         = _e.company_id
       AND oe.channel_account_id = _e.channel_account_id
       AND COALESCE(oe.sku_id, oe.offer_id) = COALESCE(_e.sku_id, _e.offer_id)
       AND oe.status IN ('pending','failed')
       AND oe.listing_version < _e.listing_version
     RETURNING 1
  )
  SELECT count(*)::int INTO _superseded FROM sup;

  RETURN jsonb_build_object(
    'ok', true, 'event_id', _e.id,
    'listing_version', _e.listing_version, 'superseded', _superseded);
END $$;

-- Fix complete_outbox_event: the earlier payload-merge line would trip the
-- update_guard. Rewrite without touching payload.
CREATE OR REPLACE FUNCTION public.complete_outbox_event(
  _event_id uuid, _claim_token uuid, _external_ref jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _e public.outbox_events%ROWTYPE;
  _superseded int := 0;
BEGIN
  IF _event_id IS NULL OR _claim_token IS NULL THEN
    RAISE EXCEPTION 'event_id and claim_token required';
  END IF;

  SELECT * INTO _e FROM public.outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF _e.status <> 'in_flight' THEN
    RAISE EXCEPTION 'event % not in_flight (status=%)', _event_id, _e.status;
  END IF;
  IF _e.claim_token IS DISTINCT FROM _claim_token THEN
    RAISE EXCEPTION 'claim_token mismatch';
  END IF;
  IF _e.lease_expires_at < now() THEN
    RAISE EXCEPTION 'lease expired';
  END IF;

  UPDATE public.outbox_events
     SET status           = 'delivered',
         delivered_at     = now(),
         claim_token      = NULL,
         claimed_at       = NULL,
         lease_expires_at = NULL,
         last_error       = NULL
   WHERE id = _e.id;

  WITH sup AS (
    UPDATE public.outbox_events oe
       SET status = 'superseded'
     WHERE oe.company_id         = _e.company_id
       AND oe.channel_account_id = _e.channel_account_id
       AND COALESCE(oe.sku_id, oe.offer_id) = COALESCE(_e.sku_id, _e.offer_id)
       AND oe.status IN ('pending','failed')
       AND oe.listing_version < _e.listing_version
     RETURNING 1
  )
  SELECT count(*)::int INTO _superseded FROM sup;

  RETURN jsonb_build_object(
    'ok', true, 'event_id', _e.id,
    'listing_version', _e.listing_version, 'superseded', _superseded,
    'external_ref', COALESCE(_external_ref,'{}'::jsonb));
END $$;

-- fail_outbox_event: increment attempts (single increment), exponential backoff,
-- transition to dead_letter atomically if attempts >= max_attempts.
CREATE OR REPLACE FUNCTION public.fail_outbox_event(
  _event_id uuid, _claim_token uuid, _error text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _e public.outbox_events%ROWTYPE;
  _new_attempts int;
  _backoff_secs int;
  _next_attempt timestamptz;
  _now timestamptz := now();
  _terminal boolean := false;
BEGIN
  IF _event_id IS NULL OR _claim_token IS NULL THEN
    RAISE EXCEPTION 'event_id and claim_token required';
  END IF;

  SELECT * INTO _e FROM public.outbox_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF _e.status <> 'in_flight' THEN
    RAISE EXCEPTION 'event % not in_flight (status=%)', _event_id, _e.status;
  END IF;
  IF _e.claim_token IS DISTINCT FROM _claim_token THEN
    RAISE EXCEPTION 'claim_token mismatch';
  END IF;

  _new_attempts := _e.attempts + 1;

  IF _new_attempts >= _e.max_attempts THEN
    _terminal := true;
    UPDATE public.outbox_events
       SET status           = 'dead_letter',
           attempts         = _new_attempts,
           last_error       = _error,
           claim_token      = NULL,
           claimed_at       = NULL,
           lease_expires_at = NULL,
           next_attempt_at  = NULL
     WHERE id = _e.id;

    INSERT INTO public.outbox_dead_letters
      (event_id, company_id, channel_account_id, listing_id,
       listing_version, event_type, payload, attempts, last_error)
    VALUES
      (_e.id, _e.company_id, _e.channel_account_id, _e.listing_id,
       _e.listing_version, _e.event_type, _e.payload, _new_attempts, _error);
  ELSE
    -- Exponential backoff: 5s, 15s, 45s, 135s, ... capped at 1h.
    _backoff_secs := LEAST(3600, 5 * (3 ^ (_new_attempts - 1))::int);
    _next_attempt := _now + make_interval(secs => _backoff_secs);
    UPDATE public.outbox_events
       SET status           = 'failed',
           attempts         = _new_attempts,
           last_error       = _error,
           claim_token      = NULL,
           claimed_at       = NULL,
           lease_expires_at = NULL,
           next_attempt_at  = _next_attempt
     WHERE id = _e.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'event_id', _e.id,
    'attempts', _new_attempts,
    'terminal', _terminal,
    'next_attempt_at', _next_attempt);
END $$;

-- recover_expired_leases: expired in_flight -> failed WITHOUT incrementing
-- attempts (Charter Rev 3 rule).
CREATE OR REPLACE FUNCTION public.recover_expired_leases(
  _channel_account_id uuid DEFAULT NULL,
  _limit int DEFAULT 100
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _n int;
BEGIN
  IF _limit IS NULL OR _limit <= 0 OR _limit > 10000 THEN
    RAISE EXCEPTION 'invalid limit';
  END IF;

  WITH expired AS (
    SELECT id FROM public.outbox_events
     WHERE status = 'in_flight'
       AND lease_expires_at < now()
       AND (_channel_account_id IS NULL OR channel_account_id = _channel_account_id)
     ORDER BY lease_expires_at ASC
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events oe
     SET status           = 'failed',
         claim_token      = NULL,
         claimed_at       = NULL,
         lease_expires_at = NULL,
         next_attempt_at  = now(),
         last_error       = COALESCE(oe.last_error, 'lease expired')
   WHERE oe.id IN (SELECT id FROM expired);

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

-- ============================================================================
-- 6) Grants — worker RPCs are service_role only.
-- ============================================================================
REVOKE ALL ON FUNCTION public.claim_outbox_batch(uuid, int, int)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_outbox_event(uuid, uuid, jsonb)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid, uuid, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_expired_leases(uuid, int)           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(uuid, int, int)       TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_outbox_event(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_outbox_event(uuid, uuid, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_expired_leases(uuid, int)        TO service_role;
