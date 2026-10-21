
-- HOTFIX M1: auth_mode
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_auth_mode') THEN
    CREATE TYPE public.channel_auth_mode AS ENUM ('client_credentials', 'intermediary_oauth');
  END IF;
END $$;

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS auth_mode public.channel_auth_mode NOT NULL DEFAULT 'client_credentials';

DROP VIEW IF EXISTS public.channel_connections_safe;
CREATE VIEW public.channel_connections_safe
WITH (security_invoker = true)
AS
SELECT id, company_id, channel_account_id, provider, auth_mode,
  mode, live_sync_enabled, health,
  last_health_check_at, last_error_at,
  CASE WHEN last_error IS NULL THEN NULL ELSE split_part(last_error, ':', 1) END AS last_error_code,
  created_at, updated_at
FROM public.channel_connections;
GRANT SELECT ON public.channel_connections_safe TO authenticated;

-- ENUMS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_batch_status') THEN
    CREATE TYPE public.import_batch_status AS ENUM ('running', 'succeeded', 'failed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'imported_offer_review_status') THEN
    CREATE TYPE public.imported_offer_review_status AS ENUM ('pending','suggested_match','needs_manual','linked','rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'imported_offer_bol_status') THEN
    CREATE TYPE public.imported_offer_bol_status AS ENUM ('active','not_published','unknown');
  END IF;
END $$;

-- channel_import_batches
CREATE TABLE IF NOT EXISTS public.channel_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_account_id UUID NOT NULL REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'bol'),
  status public.import_batch_status NOT NULL DEFAULT 'running',
  total_offers INTEGER NOT NULL DEFAULT 0 CHECK (total_offers >= 0),
  matched_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  needs_manual_count INTEGER NOT NULL DEFAULT 0 CHECK (needs_manual_count >= 0),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_company ON public.channel_import_batches(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_conn ON public.channel_import_batches(connection_id, started_at DESC);
GRANT SELECT ON public.channel_import_batches TO authenticated;
GRANT ALL   ON public.channel_import_batches TO service_role;
ALTER TABLE public.channel_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches_select_members" ON public.channel_import_batches
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = channel_import_batches.company_id AND m.user_id = auth.uid()));

-- channel_imported_offers
CREATE TABLE IF NOT EXISTS public.channel_imported_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.channel_import_batches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_account_id UUID NOT NULL REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  bol_offer_id TEXT NOT NULL,
  ean TEXT,
  title TEXT,
  brand TEXT,
  condition TEXT,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  bol_status public.imported_offer_bol_status NOT NULL DEFAULT 'unknown',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status public.imported_offer_review_status NOT NULL DEFAULT 'pending',
  suggested_sku_id UUID REFERENCES public.catalog_skus(id) ON DELETE SET NULL,
  linked_sku_id UUID REFERENCES public.catalog_skus(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_offer_per_account UNIQUE (company_id, channel_account_id, bol_offer_id)
);
CREATE INDEX IF NOT EXISTS idx_imported_offers_batch ON public.channel_imported_offers(batch_id);
CREATE INDEX IF NOT EXISTS idx_imported_offers_company_review ON public.channel_imported_offers(company_id, review_status, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_imported_offers_ean ON public.channel_imported_offers(company_id, ean) WHERE ean IS NOT NULL;
GRANT SELECT ON public.channel_imported_offers TO authenticated;
GRANT ALL   ON public.channel_imported_offers TO service_role;
ALTER TABLE public.channel_imported_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imported_offers_select_members" ON public.channel_imported_offers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = channel_imported_offers.company_id AND m.user_id = auth.uid()));

-- channel_ean_map
CREATE TABLE IF NOT EXISTS public.channel_ean_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES public.catalog_skus(id) ON DELETE CASCADE,
  ean TEXT NOT NULL CHECK (length(ean) BETWEEN 8 AND 14),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ean_per_company UNIQUE (company_id, ean)
);
CREATE INDEX IF NOT EXISTS idx_ean_map_lookup ON public.channel_ean_map(company_id, ean);
CREATE INDEX IF NOT EXISTS idx_ean_map_sku ON public.channel_ean_map(sku_id);
GRANT SELECT ON public.channel_ean_map TO authenticated;
GRANT ALL   ON public.channel_ean_map TO service_role;
ALTER TABLE public.channel_ean_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ean_map_select_members" ON public.channel_ean_map
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = channel_ean_map.company_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public._ean_map_check_sku_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sku_company UUID;
BEGIN
  SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = NEW.sku_id;
  IF _sku_company IS NULL THEN RAISE EXCEPTION 'sku not found: %', NEW.sku_id; END IF;
  IF _sku_company <> NEW.company_id THEN
    RAISE EXCEPTION 'sku % does not belong to company %', NEW.sku_id, NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ean_map_check_sku ON public.channel_ean_map;
CREATE TRIGGER trg_ean_map_check_sku BEFORE INSERT OR UPDATE ON public.channel_ean_map
  FOR EACH ROW EXECUTE FUNCTION public._ean_map_check_sku_company();

-- updated_at triggers use existing touch_updated_at()
DROP TRIGGER IF EXISTS trg_import_batches_updated_at ON public.channel_import_batches;
CREATE TRIGGER trg_import_batches_updated_at BEFORE UPDATE ON public.channel_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_imported_offers_updated_at ON public.channel_imported_offers;
CREATE TRIGGER trg_imported_offers_updated_at BEFORE UPDATE ON public.channel_imported_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RPC: begin_offer_import_batch
CREATE OR REPLACE FUNCTION public.begin_offer_import_batch(
  _company_id UUID, _channel_account_id UUID, _connection_id UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _batch_id UUID; _conn RECORD;
BEGIN
  SELECT * INTO _conn FROM public.channel_connections WHERE id = _connection_id;
  IF _conn IS NULL THEN RAISE EXCEPTION 'connection not found'; END IF;
  IF _conn.company_id <> _company_id OR _conn.channel_account_id <> _channel_account_id THEN
    RAISE EXCEPTION 'connection does not match tenant/account';
  END IF;
  IF _conn.provider <> 'bol' THEN RAISE EXCEPTION 'only bol import supported'; END IF;
  INSERT INTO public.channel_import_batches (company_id, channel_account_id, connection_id, provider)
    VALUES (_company_id, _channel_account_id, _connection_id, 'bol') RETURNING id INTO _batch_id;
  RETURN _batch_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_offer_import_batch(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_offer_import_batch(UUID,UUID,UUID) TO service_role;

-- RPC: ingest_imported_offer
CREATE OR REPLACE FUNCTION public.ingest_imported_offer(
  _batch_id UUID, _bol_offer_id TEXT, _ean TEXT, _title TEXT, _brand TEXT, _condition TEXT,
  _price_cents INTEGER, _currency TEXT, _stock INTEGER, _bol_status public.imported_offer_bol_status, _raw JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _batch RECORD; _offer_id UUID; _match_count INTEGER := 0; _suggested UUID := NULL;
        _review public.imported_offer_review_status;
BEGIN
  SELECT * INTO _batch FROM public.channel_import_batches WHERE id = _batch_id FOR UPDATE;
  IF _batch IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF _batch.status <> 'running' THEN RAISE EXCEPTION 'batch not running'; END IF;
  IF _ean IS NOT NULL THEN
    SELECT count(*), min(sku_id) INTO _match_count, _suggested
    FROM public.channel_ean_map WHERE company_id = _batch.company_id AND ean = _ean;
  END IF;
  IF _match_count = 1 THEN _review := 'suggested_match';
  ELSE _review := 'needs_manual'; _suggested := NULL; END IF;

  INSERT INTO public.channel_imported_offers (
    batch_id, company_id, channel_account_id, connection_id,
    bol_offer_id, ean, title, brand, condition, price_cents, currency, stock, bol_status, raw_payload,
    review_status, suggested_sku_id
  ) VALUES (
    _batch_id, _batch.company_id, _batch.channel_account_id, _batch.connection_id,
    _bol_offer_id, _ean, _title, _brand, _condition, _price_cents, COALESCE(_currency,'EUR'), _stock,
    COALESCE(_bol_status,'unknown'), COALESCE(_raw,'{}'::jsonb), _review, _suggested
  )
  ON CONFLICT (company_id, channel_account_id, bol_offer_id) DO UPDATE SET
    ean = EXCLUDED.ean, title = EXCLUDED.title, brand = EXCLUDED.brand, condition = EXCLUDED.condition,
    price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency, stock = EXCLUDED.stock,
    bol_status = EXCLUDED.bol_status, raw_payload = EXCLUDED.raw_payload,
    review_status = CASE WHEN public.channel_imported_offers.review_status IN ('linked','rejected')
                         THEN public.channel_imported_offers.review_status ELSE EXCLUDED.review_status END,
    suggested_sku_id = CASE WHEN public.channel_imported_offers.review_status IN ('linked','rejected')
                            THEN public.channel_imported_offers.suggested_sku_id ELSE EXCLUDED.suggested_sku_id END,
    imported_at = now()
  RETURNING id INTO _offer_id;

  UPDATE public.channel_import_batches
    SET total_offers = total_offers + 1,
        matched_count = matched_count + CASE WHEN _review='suggested_match' THEN 1 ELSE 0 END,
        needs_manual_count = needs_manual_count + CASE WHEN _review='needs_manual' THEN 1 ELSE 0 END
    WHERE id = _batch_id;
  RETURN _offer_id;
END $$;
REVOKE ALL ON FUNCTION public.ingest_imported_offer(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,INTEGER,public.imported_offer_bol_status,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_imported_offer(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,INTEGER,public.imported_offer_bol_status,JSONB) TO service_role;

-- RPC: close_offer_import_batch
CREATE OR REPLACE FUNCTION public.close_offer_import_batch(
  _batch_id UUID, _outcome public.import_batch_status, _error_code TEXT DEFAULT NULL, _error_message TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _outcome NOT IN ('succeeded','failed','cancelled') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
  UPDATE public.channel_import_batches
    SET status = _outcome, error_code = _error_code, error_message = _error_message, finished_at = now()
    WHERE id = _batch_id AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found or already closed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.close_offer_import_batch(UUID,public.import_batch_status,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_offer_import_batch(UUID,public.import_batch_status,TEXT,TEXT) TO service_role;

-- RPC: link_imported_offer_to_sku
CREATE OR REPLACE FUNCTION public.link_imported_offer_to_sku(
  _imported_offer_id UUID, _sku_id UUID, _reviewer UUID, _note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _offer RECORD; _sku_company UUID;
BEGIN
  SELECT * INTO _offer FROM public.channel_imported_offers WHERE id = _imported_offer_id FOR UPDATE;
  IF _offer IS NULL THEN RAISE EXCEPTION 'imported offer not found'; END IF;
  IF _offer.review_status = 'rejected' THEN RAISE EXCEPTION 'offer already rejected'; END IF;
  SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = _sku_id;
  IF _sku_company IS NULL THEN RAISE EXCEPTION 'sku not found'; END IF;
  IF _sku_company <> _offer.company_id THEN RAISE EXCEPTION 'sku belongs to a different company'; END IF;
  UPDATE public.channel_imported_offers
    SET linked_sku_id = _sku_id, review_status = 'linked',
        review_note = _note, reviewed_by = _reviewer, reviewed_at = now()
    WHERE id = _imported_offer_id;
END $$;
REVOKE ALL ON FUNCTION public.link_imported_offer_to_sku(UUID,UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_imported_offer_to_sku(UUID,UUID,UUID,TEXT) TO service_role;

-- RPC: reject_imported_offer
CREATE OR REPLACE FUNCTION public.reject_imported_offer(
  _imported_offer_id UUID, _reviewer UUID, _reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.channel_imported_offers
    SET review_status = 'rejected', review_note = _reason,
        reviewed_by = _reviewer, reviewed_at = now(),
        suggested_sku_id = NULL, linked_sku_id = NULL
    WHERE id = _imported_offer_id AND review_status <> 'linked';
  IF NOT FOUND THEN RAISE EXCEPTION 'offer not found or already linked'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.reject_imported_offer(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_imported_offer(UUID,UUID,TEXT) TO service_role;
