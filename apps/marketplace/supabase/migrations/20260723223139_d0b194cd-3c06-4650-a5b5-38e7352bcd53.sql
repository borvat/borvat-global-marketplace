
-- =========================================================================
-- Phase 3 — Migration 3: Reconciliation (snapshots + drift reports)
-- Multi-tenant strict: every row carries (company_id, channel_account_id,
-- target = sku_id XOR offer_id). Never merge across sellers or catalog.
-- =========================================================================

-- ---------- 1. channel_snapshot_batches ---------------------------------
CREATE TABLE public.channel_snapshot_batches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  source             text NOT NULL,
  status             text NOT NULL DEFAULT 'open',
  note               text,
  taken_at           timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_snapshot_batches_source_ck
    CHECK (source IN ('mock','pull','webhook','manual')),
  CONSTRAINT channel_snapshot_batches_status_ck
    CHECK (status IN ('open','closed')),
  CONSTRAINT channel_snapshot_batches_closed_shape_ck
    CHECK ((status = 'closed' AND closed_at IS NOT NULL)
        OR (status = 'open'   AND closed_at IS NULL))
);
CREATE INDEX channel_snapshot_batches_company_idx
  ON public.channel_snapshot_batches (company_id, taken_at DESC);
CREATE INDEX channel_snapshot_batches_channel_idx
  ON public.channel_snapshot_batches (channel_account_id, taken_at DESC);

GRANT SELECT ON public.channel_snapshot_batches TO authenticated;
GRANT ALL    ON public.channel_snapshot_batches TO service_role;

ALTER TABLE public.channel_snapshot_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_snapshot_batches_select
  ON public.channel_snapshot_batches
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

-- ---------- 2. channel_snapshots ---------------------------------------
CREATE TABLE public.channel_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES public.channel_snapshot_batches(id) ON DELETE RESTRICT,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  sku_id             uuid REFERENCES public.catalog_skus(id)   ON DELETE RESTRICT,
  offer_id           uuid REFERENCES public.catalog_offers(id) ON DELETE RESTRICT,
  external_quantity  integer NOT NULL,
  external_version   bigint,
  external_ref       jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_snapshots_target_xor_ck
    CHECK ((sku_id IS NOT NULL) <> (offer_id IS NOT NULL)),
  CONSTRAINT channel_snapshots_qty_ck  CHECK (external_quantity >= 0),
  CONSTRAINT channel_snapshots_ver_ck  CHECK (external_version IS NULL OR external_version >= 0)
);
-- Strict multi-tenant target uniqueness inside a batch:
CREATE UNIQUE INDEX channel_snapshots_target_uniq
  ON public.channel_snapshots
  (batch_id, company_id, channel_account_id, COALESCE(sku_id, offer_id));
CREATE INDEX channel_snapshots_batch_idx ON public.channel_snapshots (batch_id);

GRANT SELECT ON public.channel_snapshots TO authenticated;
GRANT ALL    ON public.channel_snapshots TO service_role;

ALTER TABLE public.channel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_snapshots_select
  ON public.channel_snapshots
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

-- ---------- 3. channel_reconciliation_reports -------------------------
CREATE TABLE public.channel_reconciliation_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES public.channel_snapshot_batches(id) ON DELETE RESTRICT,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  run_at             timestamptz NOT NULL DEFAULT now(),
  total_snapshots    integer NOT NULL DEFAULT 0,
  total_listings     integer NOT NULL DEFAULT 0,
  matched            integer NOT NULL DEFAULT 0,
  drift_quantity     integer NOT NULL DEFAULT 0,
  drift_version      integer NOT NULL DEFAULT 0,
  missing_local      integer NOT NULL DEFAULT 0,
  missing_external   integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'completed',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_status_ck CHECK (status IN ('completed','failed')),
  CONSTRAINT reports_counts_ck CHECK (
    matched >= 0 AND drift_quantity >= 0 AND drift_version >= 0
    AND missing_local >= 0 AND missing_external >= 0
  )
);
CREATE INDEX reports_batch_idx   ON public.channel_reconciliation_reports (batch_id);
CREATE INDEX reports_company_idx ON public.channel_reconciliation_reports (company_id, run_at DESC);

GRANT SELECT ON public.channel_reconciliation_reports TO authenticated;
GRANT ALL    ON public.channel_reconciliation_reports TO service_role;

ALTER TABLE public.channel_reconciliation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select
  ON public.channel_reconciliation_reports
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

-- ---------- 4. channel_reconciliation_findings ------------------------
CREATE TABLE public.channel_reconciliation_findings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES public.channel_reconciliation_reports(id) ON DELETE RESTRICT,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE RESTRICT,
  listing_id         uuid REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  sku_id             uuid REFERENCES public.catalog_skus(id)     ON DELETE RESTRICT,
  offer_id           uuid REFERENCES public.catalog_offers(id)   ON DELETE RESTRICT,
  finding_type       text NOT NULL,
  local_quantity     integer,
  local_version      bigint,
  external_quantity  integer,
  external_version   bigint,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution         text NOT NULL DEFAULT 'pending',
  remediation_event_id uuid REFERENCES public.outbox_events(id) ON DELETE RESTRICT,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT findings_target_xor_ck
    CHECK ((sku_id IS NOT NULL) <> (offer_id IS NOT NULL)),
  CONSTRAINT findings_type_ck CHECK (
    finding_type IN ('drift_quantity','drift_version','missing_local','missing_external')
  ),
  CONSTRAINT findings_resolution_ck CHECK (
    resolution IN ('pending','reenqueued','ignored','resolved')
  ),
  CONSTRAINT findings_local_shape_ck CHECK (
    finding_type = 'missing_local' OR listing_id IS NOT NULL
  )
);
CREATE INDEX findings_report_idx  ON public.channel_reconciliation_findings (report_id);
CREATE INDEX findings_company_idx ON public.channel_reconciliation_findings (company_id, created_at DESC);
CREATE INDEX findings_listing_idx ON public.channel_reconciliation_findings (listing_id) WHERE listing_id IS NOT NULL;

GRANT SELECT ON public.channel_reconciliation_findings TO authenticated;
GRANT ALL    ON public.channel_reconciliation_findings TO service_role;

ALTER TABLE public.channel_reconciliation_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY findings_select
  ON public.channel_reconciliation_findings
  FOR SELECT TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'channels.read'));

-- =========================================================================
-- RPCs (service_role only). All revoke from public/anon/authenticated.
-- =========================================================================

-- ---------- open_reconciliation_batch ---------------------------------
CREATE OR REPLACE FUNCTION public.open_reconciliation_batch(
  _channel_account_id uuid,
  _source text,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_batch   uuid;
BEGIN
  SELECT company_id INTO v_company
    FROM public.channel_accounts WHERE id = _channel_account_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'channel_account_not_found' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.channel_snapshot_batches
    (company_id, channel_account_id, source, note)
    VALUES (v_company, _channel_account_id, _source, _note)
  RETURNING id INTO v_batch;

  RETURN v_batch;
END $$;

REVOKE ALL ON FUNCTION public.open_reconciliation_batch(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_reconciliation_batch(uuid, text, text) TO service_role;

-- ---------- record_channel_snapshot -----------------------------------
CREATE OR REPLACE FUNCTION public.record_channel_snapshot(
  _batch_id uuid,
  _sku_id uuid,
  _offer_id uuid,
  _external_quantity integer,
  _external_version bigint DEFAULT NULL,
  _external_ref jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch   public.channel_snapshot_batches;
  v_snap_id uuid;
BEGIN
  IF (_sku_id IS NOT NULL) = (_offer_id IS NOT NULL) THEN
    RAISE EXCEPTION 'target_xor_violated: exactly one of sku_id / offer_id required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_batch FROM public.channel_snapshot_batches WHERE id = _batch_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_batch.status <> 'open' THEN
    RAISE EXCEPTION 'batch_not_open' USING ERRCODE = 'P0001';
  END IF;

  -- Cross-tenant guard on SKU / offer:
  IF _sku_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_skus s
       WHERE s.id = _sku_id AND s.company_id = v_batch.company_id
    ) THEN
      RAISE EXCEPTION 'sku_not_in_company' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_offers o
       WHERE o.id = _offer_id AND o.company_id = v_batch.company_id
    ) THEN
      RAISE EXCEPTION 'offer_not_in_company' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.channel_snapshots
    (batch_id, company_id, channel_account_id, sku_id, offer_id,
     external_quantity, external_version, external_ref)
  VALUES
    (_batch_id, v_batch.company_id, v_batch.channel_account_id,
     _sku_id, _offer_id, _external_quantity, _external_version, _external_ref)
  RETURNING id INTO v_snap_id;

  RETURN v_snap_id;
END $$;

REVOKE ALL ON FUNCTION public.record_channel_snapshot(uuid, uuid, uuid, integer, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_channel_snapshot(uuid, uuid, uuid, integer, bigint, jsonb) TO service_role;

-- ---------- close_reconciliation_batch --------------------------------
CREATE OR REPLACE FUNCTION public.close_reconciliation_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.channel_snapshot_batches
     SET status = 'closed', closed_at = now()
   WHERE id = _batch_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_open_or_missing' USING ERRCODE = 'P0001';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.close_reconciliation_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_reconciliation_batch(uuid) TO service_role;

-- ---------- run_reconciliation ----------------------------------------
-- Compares snapshots inside a batch to channel_listings scoped to the SAME
-- (company_id, channel_account_id, target). Never joins across companies.
CREATE OR REPLACE FUNCTION public.run_reconciliation(_batch_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch  public.channel_snapshot_batches;
  v_report uuid;
  v_total_snap  integer := 0;
  v_total_list  integer := 0;
  v_matched     integer := 0;
  v_drift_qty   integer := 0;
  v_drift_ver   integer := 0;
  v_miss_local  integer := 0;
  v_miss_ext    integer := 0;
BEGIN
  SELECT * INTO v_batch FROM public.channel_snapshot_batches WHERE id = _batch_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_batch.status <> 'closed' THEN
    RAISE EXCEPTION 'batch_not_closed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.channel_reconciliation_reports
    (batch_id, company_id, channel_account_id)
    VALUES (_batch_id, v_batch.company_id, v_batch.channel_account_id)
  RETURNING id INTO v_report;

  -- FULL OUTER JOIN inside strict tenant scope.
  WITH snaps AS (
    SELECT * FROM public.channel_snapshots
     WHERE batch_id = _batch_id
       AND company_id = v_batch.company_id
       AND channel_account_id = v_batch.channel_account_id
  ),
  listings AS (
    SELECT id, company_id, channel_account_id, sku_id, offer_id,
           published_quantity, published_version, status
      FROM public.channel_listings
     WHERE company_id = v_batch.company_id
       AND channel_account_id = v_batch.channel_account_id
       AND status <> 'archived'
  ),
  joined AS (
    SELECT s.id AS snap_id, s.sku_id AS s_sku, s.offer_id AS s_offer,
           s.external_quantity, s.external_version,
           l.id AS listing_id, l.sku_id AS l_sku, l.offer_id AS l_offer,
           l.published_quantity, l.published_version
      FROM snaps s
      FULL OUTER JOIN listings l
        ON COALESCE(s.sku_id, s.offer_id) = COALESCE(l.sku_id, l.offer_id)
  ),
  classified AS (
    SELECT
      snap_id, listing_id,
      COALESCE(s_sku,  l_sku)   AS sku_id,
      COALESCE(s_offer,l_offer) AS offer_id,
      external_quantity, external_version,
      published_quantity, published_version,
      CASE
        WHEN snap_id IS NULL      THEN 'missing_external'
        WHEN listing_id IS NULL   THEN 'missing_local'
        WHEN published_quantity <> external_quantity THEN 'drift_quantity'
        WHEN external_version IS NOT NULL
             AND published_version <> external_version   THEN 'drift_version'
        ELSE 'match'
      END AS kind
    FROM joined
  ),
  ins AS (
    INSERT INTO public.channel_reconciliation_findings
      (report_id, company_id, channel_account_id, listing_id, sku_id, offer_id,
       finding_type, local_quantity, local_version, external_quantity, external_version)
    SELECT v_report, v_batch.company_id, v_batch.channel_account_id,
           listing_id, sku_id, offer_id,
           kind, published_quantity, published_version, external_quantity, external_version
      FROM classified
     WHERE kind <> 'match'
    RETURNING finding_type
  )
  SELECT
    (SELECT count(*) FROM snaps),
    (SELECT count(*) FROM listings),
    (SELECT count(*) FROM classified WHERE kind = 'match'),
    (SELECT count(*) FROM ins WHERE finding_type = 'drift_quantity'),
    (SELECT count(*) FROM ins WHERE finding_type = 'drift_version'),
    (SELECT count(*) FROM ins WHERE finding_type = 'missing_local'),
    (SELECT count(*) FROM ins WHERE finding_type = 'missing_external')
  INTO v_total_snap, v_total_list, v_matched, v_drift_qty, v_drift_ver, v_miss_local, v_miss_ext;

  UPDATE public.channel_reconciliation_reports
     SET total_snapshots = v_total_snap,
         total_listings  = v_total_list,
         matched         = v_matched,
         drift_quantity  = v_drift_qty,
         drift_version   = v_drift_ver,
         missing_local   = v_miss_local,
         missing_external= v_miss_ext
   WHERE id = v_report;

  RETURN v_report;
END $$;

REVOKE ALL ON FUNCTION public.run_reconciliation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_reconciliation(uuid) TO service_role;

-- ---------- reenqueue_drift_finding ------------------------------------
-- Emits a per-target 'channel.resync' outbox event using the listing's
-- CURRENT published_quantity / published_version. Never touches other sellers.
-- Skips if an equivalent in_flight/pending/failed event already exists for
-- the exact target (the outbox unique index would reject in_flight anyway).
CREATE OR REPLACE FUNCTION public.reenqueue_drift_finding(_finding_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_f public.channel_reconciliation_findings;
  v_l public.channel_listings;
  v_event uuid;
BEGIN
  SELECT * INTO v_f FROM public.channel_reconciliation_findings WHERE id = _finding_id;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'finding_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_f.resolution <> 'pending' THEN
    RAISE EXCEPTION 'finding_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF v_f.finding_type NOT IN ('drift_quantity','drift_version','missing_external') THEN
    RAISE EXCEPTION 'finding_not_reenqueueable' USING ERRCODE = 'P0001';
  END IF;
  IF v_f.listing_id IS NULL THEN
    RAISE EXCEPTION 'finding_has_no_local_listing' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_l FROM public.channel_listings WHERE id = v_f.listing_id;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'listing_missing' USING ERRCODE = 'P0001';
  END IF;

  -- Tenant integrity: listing must match finding's company & channel & target.
  IF v_l.company_id <> v_f.company_id
     OR v_l.channel_account_id <> v_f.channel_account_id
     OR COALESCE(v_l.sku_id, v_l.offer_id) <> COALESCE(v_f.sku_id, v_f.offer_id) THEN
    RAISE EXCEPTION 'tenant_target_mismatch' USING ERRCODE = 'P0001';
  END IF;

  v_event := public.enqueue_outbox_event(
    v_l.id,
    v_l.published_version,
    'channel.resync',
    jsonb_build_object(
      'reason', 'reconciliation',
      'finding_id', v_f.id,
      'published_quantity', v_l.published_quantity,
      'published_version',  v_l.published_version
    )
  );

  UPDATE public.channel_reconciliation_findings
     SET resolution = 'reenqueued',
         remediation_event_id = v_event,
         resolved_at = now()
   WHERE id = _finding_id;

  RETURN v_event;
END $$;

REVOKE ALL ON FUNCTION public.reenqueue_drift_finding(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reenqueue_drift_finding(uuid) TO service_role;
