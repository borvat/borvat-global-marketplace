
-- =========================================================================
-- Phase 4 — Migration 1: Bol Connection & Control Plane (read-only)
-- =========================================================================

CREATE TYPE public.p4_connection_mode AS ENUM ('disabled','read_only','shadow','live');
CREATE TYPE public.p4_connection_health AS ENUM ('unknown','healthy','degraded','error');

-- channel_connections ------------------------------------------------------
CREATE TABLE public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_account_id UUID NOT NULL REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('bol')),
  secret_ref TEXT NOT NULL,
  mode public.p4_connection_mode NOT NULL DEFAULT 'read_only',
  live_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  health public.p4_connection_health NOT NULL DEFAULT 'unknown',
  last_health_check_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, provider),
  CONSTRAINT chk_secret_ref_shape CHECK (secret_ref ~ '^vault:[a-z0-9-]+/[a-f0-9-]{36}$')
);
CREATE INDEX idx_channel_connections_company ON public.channel_connections(company_id);
CREATE INDEX idx_channel_connections_account ON public.channel_connections(channel_account_id);

GRANT SELECT ON public.channel_connections TO authenticated;
GRANT ALL    ON public.channel_connections TO service_role;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view own company connections"
  ON public.channel_connections FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE OR REPLACE FUNCTION public._channel_connections_validate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _acc_company UUID;
BEGIN
  SELECT company_id INTO _acc_company FROM public.channel_accounts WHERE id = NEW.channel_account_id;
  IF _acc_company IS NULL OR _acc_company <> NEW.company_id THEN
    RAISE EXCEPTION 'channel_account_id % is not in company %', NEW.channel_account_id, NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_channel_connections_validate
BEFORE INSERT OR UPDATE ON public.channel_connections
FOR EACH ROW EXECUTE FUNCTION public._channel_connections_validate();

CREATE TRIGGER trg_channel_connections_touch
BEFORE UPDATE ON public.channel_connections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public._channel_connections_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id
     OR NEW.channel_account_id <> OLD.channel_account_id
     OR NEW.provider <> OLD.provider THEN
    RAISE EXCEPTION 'connection identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_channel_connections_immutable
BEFORE UPDATE ON public.channel_connections
FOR EACH ROW EXECUTE FUNCTION public._channel_connections_immutable();

CREATE VIEW public.channel_connections_safe WITH (security_invoker = true) AS
SELECT id, company_id, channel_account_id, provider, mode, live_sync_enabled,
       health, last_health_check_at, last_error_at,
       CASE WHEN last_error IS NULL THEN NULL ELSE split_part(last_error, ':', 1) END AS last_error_code,
       created_at, updated_at
  FROM public.channel_connections;
GRANT SELECT ON public.channel_connections_safe TO authenticated;

-- channel_kill_switches ----------------------------------------------------
CREATE TABLE public.channel_kill_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  writes_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  reads_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'global' AND connection_id IS NULL)
      OR (scope = 'connection' AND connection_id IS NOT NULL))
);
CREATE UNIQUE INDEX channel_kill_switches_one_global
  ON public.channel_kill_switches(scope) WHERE scope = 'global';
CREATE UNIQUE INDEX channel_kill_switches_one_per_connection
  ON public.channel_kill_switches(connection_id) WHERE scope = 'connection';

INSERT INTO public.channel_kill_switches(scope, connection_id, writes_disabled, reads_disabled, reason)
VALUES ('global', NULL, FALSE, FALSE, 'seed');

GRANT SELECT ON public.channel_kill_switches TO authenticated;
GRANT ALL    ON public.channel_kill_switches TO service_role;
ALTER TABLE public.channel_kill_switches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members see global + own kill switches"
  ON public.channel_kill_switches FOR SELECT TO authenticated
  USING (
    scope = 'global'
    OR EXISTS (SELECT 1 FROM public.channel_connections c
                WHERE c.id = channel_kill_switches.connection_id
                  AND public.is_company_member(c.company_id, auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.p4_writes_allowed(_connection_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _mode public.p4_connection_mode; _live BOOLEAN; _g BOOLEAN; _c BOOLEAN;
BEGIN
  SELECT mode, live_sync_enabled INTO _mode, _live
    FROM public.channel_connections WHERE id = _connection_id;
  IF _mode IS NULL THEN RETURN FALSE; END IF;
  IF _mode <> 'live' OR _live IS NOT TRUE THEN RETURN FALSE; END IF;
  SELECT writes_disabled INTO _g FROM public.channel_kill_switches
    WHERE scope = 'global' AND connection_id IS NULL;
  IF COALESCE(_g, FALSE) THEN RETURN FALSE; END IF;
  SELECT writes_disabled INTO _c FROM public.channel_kill_switches
    WHERE scope = 'connection' AND connection_id = _connection_id;
  IF COALESCE(_c, FALSE) THEN RETURN FALSE; END IF;
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.p4_writes_allowed(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p4_writes_allowed(UUID) TO service_role;

-- channel_sync_runs --------------------------------------------------------
CREATE TYPE public.p4_sync_kind AS ENUM ('test_connection','offer_import','order_poll','stock_get','price_get','shipment_confirm');
CREATE TYPE public.p4_sync_status AS ENUM ('running','succeeded','failed');

CREATE TABLE public.channel_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  kind public.p4_sync_kind NOT NULL,
  status public.p4_sync_status NOT NULL DEFAULT 'running',
  items_seen INT NOT NULL DEFAULT 0,
  items_written INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_channel_sync_runs_conn ON public.channel_sync_runs(connection_id, started_at DESC);

GRANT SELECT ON public.channel_sync_runs TO authenticated;
GRANT ALL    ON public.channel_sync_runs TO service_role;
ALTER TABLE public.channel_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view own company sync runs"
  ON public.channel_sync_runs FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

-- channel_sync_cursors -----------------------------------------------------
CREATE TABLE public.channel_sync_cursors (
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  cursor_key TEXT NOT NULL,
  cursor_value TEXT,
  cursor_ts TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, cursor_key)
);
GRANT SELECT ON public.channel_sync_cursors TO authenticated;
GRANT ALL    ON public.channel_sync_cursors TO service_role;
ALTER TABLE public.channel_sync_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view own cursors"
  ON public.channel_sync_cursors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channel_connections c
                   WHERE c.id = channel_sync_cursors.connection_id
                     AND public.is_company_member(c.company_id, auth.uid())));

-- channel_api_audit --------------------------------------------------------
CREATE TABLE public.channel_api_audit (
  id BIGSERIAL PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  run_id UUID REFERENCES public.channel_sync_runs(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INT,
  duration_ms INT,
  rate_limit_remaining INT,
  retry_after_ms INT,
  error_code TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_channel_api_audit_conn ON public.channel_api_audit(connection_id, created_at DESC);
GRANT SELECT ON public.channel_api_audit TO authenticated;
GRANT ALL    ON public.channel_api_audit TO service_role;
ALTER TABLE public.channel_api_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view own audit"
  ON public.channel_api_audit FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE OR REPLACE FUNCTION public._channel_api_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'channel_api_audit is append-only'; END $$;
CREATE TRIGGER trg_channel_api_audit_no_update BEFORE UPDATE ON public.channel_api_audit
  FOR EACH ROW EXECUTE FUNCTION public._channel_api_audit_immutable();
CREATE TRIGGER trg_channel_api_audit_no_delete BEFORE DELETE ON public.channel_api_audit
  FOR EACH ROW EXECUTE FUNCTION public._channel_api_audit_immutable();

CREATE OR REPLACE FUNCTION public._channel_api_audit_no_secrets()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _txt TEXT;
BEGIN
  _txt := lower(COALESCE(NEW.meta::text, ''));
  IF _txt ~ '(client_secret|access_token|refresh_token|authorization|bearer |password|api_key|"secret")' THEN
    RAISE EXCEPTION 'audit meta contains disallowed secret-like keys';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_channel_api_audit_no_secrets
BEFORE INSERT ON public.channel_api_audit
FOR EACH ROW EXECUTE FUNCTION public._channel_api_audit_no_secrets();

-- Worker RPCs (service_role only) -----------------------------------------
CREATE OR REPLACE FUNCTION public.provision_channel_connection(
  _company_id UUID, _channel_account_id UUID, _provider TEXT, _secret_ref TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id UUID;
BEGIN
  IF _provider <> 'bol' THEN RAISE EXCEPTION 'unsupported provider %', _provider; END IF;
  INSERT INTO public.channel_connections(company_id, channel_account_id, provider, secret_ref, mode)
  VALUES (_company_id, _channel_account_id, _provider, _secret_ref, 'read_only')
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.provision_channel_connection(UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_channel_connection(UUID,UUID,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_connection_health(
  _connection_id UUID, _healthy BOOLEAN, _error_code TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.channel_connections
     SET health = CASE WHEN _healthy THEN 'healthy'::public.p4_connection_health
                       ELSE 'error'::public.p4_connection_health END,
         last_health_check_at = now(),
         last_error = CASE WHEN _healthy THEN NULL ELSE _error_code END,
         last_error_at = CASE WHEN _healthy THEN NULL ELSE now() END,
         updated_at = now()
   WHERE id = _connection_id;
END $$;
REVOKE ALL ON FUNCTION public.record_connection_health(UUID,BOOLEAN,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_connection_health(UUID,BOOLEAN,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_sync_run(
  _connection_id UUID, _kind TEXT, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _co UUID; _acc UUID; _id UUID;
BEGIN
  SELECT company_id, channel_account_id INTO _co, _acc
    FROM public.channel_connections WHERE id = _connection_id;
  IF _co IS NULL THEN RAISE EXCEPTION 'connection not found'; END IF;
  INSERT INTO public.channel_sync_runs(connection_id, company_id, channel_account_id, kind, metadata)
  VALUES (_connection_id, _co, _acc, _kind::public.p4_sync_kind, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.begin_sync_run(UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_sync_run(UUID,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.end_sync_run(
  _run_id UUID, _status TEXT, _items_seen INT DEFAULT 0,
  _items_written INT DEFAULT 0, _error_code TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.channel_sync_runs
     SET status = _status::public.p4_sync_status,
         items_seen = _items_seen, items_written = _items_written,
         error_code = _error_code, finished_at = now()
   WHERE id = _run_id;
END $$;
REVOKE ALL ON FUNCTION public.end_sync_run(UUID,TEXT,INT,INT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_sync_run(UUID,TEXT,INT,INT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.set_channel_kill_switch(
  _scope TEXT, _connection_id UUID, _writes_disabled BOOLEAN,
  _reads_disabled BOOLEAN DEFAULT FALSE, _reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _scope NOT IN ('global','connection') THEN RAISE EXCEPTION 'invalid scope'; END IF;
  IF _scope = 'global' AND _connection_id IS NOT NULL THEN
    RAISE EXCEPTION 'global scope must have null connection_id';
  END IF;
  IF _scope = 'connection' AND _connection_id IS NULL THEN
    RAISE EXCEPTION 'connection scope requires connection_id';
  END IF;
  IF _scope = 'global' THEN
    UPDATE public.channel_kill_switches
       SET writes_disabled = _writes_disabled, reads_disabled = _reads_disabled,
           reason = _reason, updated_at = now()
     WHERE scope = 'global';
  ELSE
    INSERT INTO public.channel_kill_switches(scope, connection_id, writes_disabled, reads_disabled, reason)
    VALUES ('connection', _connection_id, _writes_disabled, _reads_disabled, _reason)
    ON CONFLICT (connection_id) WHERE scope = 'connection'
    DO UPDATE SET writes_disabled = EXCLUDED.writes_disabled,
                  reads_disabled  = EXCLUDED.reads_disabled,
                  reason          = EXCLUDED.reason, updated_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_channel_kill_switch(TEXT,UUID,BOOLEAN,BOOLEAN,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_channel_kill_switch(TEXT,UUID,BOOLEAN,BOOLEAN,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_channel_api_call(
  _connection_id UUID, _run_id UUID, _direction TEXT, _method TEXT,
  _endpoint TEXT, _status_code INT, _duration_ms INT,
  _rate_limit_remaining INT DEFAULT NULL, _retry_after_ms INT DEFAULT NULL,
  _error_code TEXT DEFAULT NULL, _meta JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _co UUID; _acc UUID; _id BIGINT;
BEGIN
  SELECT company_id, channel_account_id INTO _co, _acc
    FROM public.channel_connections WHERE id = _connection_id;
  IF _co IS NULL THEN RAISE EXCEPTION 'connection not found'; END IF;
  INSERT INTO public.channel_api_audit(
    connection_id, company_id, channel_account_id, run_id, direction, method,
    endpoint, status_code, duration_ms, rate_limit_remaining, retry_after_ms,
    error_code, meta)
  VALUES (_connection_id, _co, _acc, _run_id, _direction, _method, _endpoint,
          _status_code, _duration_ms, _rate_limit_remaining, _retry_after_ms,
          _error_code, COALESCE(_meta,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.record_channel_api_call(UUID,UUID,TEXT,TEXT,TEXT,INT,INT,INT,INT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_channel_api_call(UUID,UUID,TEXT,TEXT,TEXT,INT,INT,INT,INT,TEXT,JSONB) TO service_role;

COMMENT ON FUNCTION public.p4_writes_allowed(UUID) IS
  'Phase 4 M1: read-only. No caller in M1 may perform Bol writes even when this returns true.';
