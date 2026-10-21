
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
       listing_version, attempts, reason, last_error)
    VALUES
      (_e.id, _e.company_id, _e.channel_account_id, _e.listing_id,
       _e.listing_version, _new_attempts, 'max_attempts_reached', _error);
  ELSE
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

REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_outbox_event(uuid, uuid, text) TO service_role;
