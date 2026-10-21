-- =====================================================================
-- M1C-1E-C  MANUAL SHIPPING QUOTE REQUEST / ITEM / PACKAGE SNAPSHOT
-- Schema foundation only. Zero rows. Owner-only. No RPC, no views.
-- =====================================================================

-- Tenancy prerequisite: declarative buyer-ownership of a destination version
ALTER TABLE public.customer_delivery_destination_versions
  ADD CONSTRAINT cddv_id_buyer_uk UNIQUE (id, buyer_principal_id);

-- ---------------------------------------------------------------- requests
CREATE TABLE public.manual_shipping_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  merchant_store_id uuid NOT NULL,
  buyer_principal_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  delivery_destination_version_id uuid NOT NULL,
  fulfillment_origin_id uuid NULL,
  shipment_form text NOT NULL,
  currency_code text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  supersedes_request_id uuid NULL REFERENCES public.manual_shipping_quote_requests(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  requested_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msqr_store_company_fk FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT msqr_destination_buyer_fk FOREIGN KEY (delivery_destination_version_id, buyer_principal_id)
    REFERENCES public.customer_delivery_destination_versions(id, buyer_principal_id) ON DELETE RESTRICT,
  CONSTRAINT msqr_origin_tenancy_fk FOREIGN KEY (fulfillment_origin_id, company_id, merchant_store_id)
    REFERENCES public.merchant_fulfillment_origins(id, company_id, merchant_store_id) ON DELETE RESTRICT,
  CONSTRAINT msqr_id_company_store_uk UNIQUE (id, company_id, merchant_store_id),
  CONSTRAINT msqr_family_version_uk UNIQUE (request_family_id, version_number),
  CONSTRAINT msqr_shipment_form_ck CHECK (shipment_form = ANY (ARRAY['parcel','multi_parcel','pallet','freight'])),
  CONSTRAINT msqr_currency_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT msqr_version_ck CHECK (version_number > 0),
  CONSTRAINT msqr_status_ck CHECK (status = ANY (ARRAY['draft','requested','under_review','quoted','accepted','declined','expired','cancelled'])),
  CONSTRAINT msqr_supersedes_self_ck CHECK (supersedes_request_id IS NULL OR supersedes_request_id <> id),
  CONSTRAINT msqr_requested_at_ck CHECK (
    (status = 'draft' AND requested_at IS NULL)
    OR (status = 'cancelled')
    OR (status <> 'draft' AND requested_at IS NOT NULL)),
  CONSTRAINT msqr_expiry_ck CHECK (expires_at IS NULL OR (requested_at IS NOT NULL AND expires_at > requested_at)),
  CONSTRAINT msqr_origin_required_after_draft_ck CHECK (
    status IN ('draft','cancelled') OR fulfillment_origin_id IS NOT NULL)
);

COMMENT ON TABLE public.manual_shipping_quote_requests IS
  'M1C-1E-C. One manual shipping quote request per buyer, per merchant store, per exact destination version, per currency, per fulfilment group. Requests DO NOT reserve inventory, DO NOT pin product availability, DO NOT pin product price, DO NOT carry a shipping charge and DO NOT permit payment. Product, stock, origin eligibility and price MUST be re-validated at offer creation, offer acceptance and checkout confirmation. Owner-only; no RPC, no view, no policy.';
COMMENT ON COLUMN public.manual_shipping_quote_requests.shipment_form IS
  'Contractual snapshot of the shipment form for THIS request only (parcel | multi_parcel | pallet | freight). Never inferred from bulky handling class or dimensions, never stored on the destination, and never an assertion of carrier eligibility.';
COMMENT ON COLUMN public.manual_shipping_quote_requests.delivery_destination_version_id IS
  'Exact pinned customer_delivery_destination_versions.id owned by the same buyer. Address fields are never copied into the request.';

-- ------------------------------------------------------------------ items
CREATE TABLE public.manual_shipping_quote_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_shipping_quote_request_id uuid NOT NULL,
  company_id uuid NOT NULL,
  merchant_store_id uuid NOT NULL,
  shipping_profile_id uuid NOT NULL,
  line_number integer NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msqri_request_tenancy_fk FOREIGN KEY (manual_shipping_quote_request_id, company_id, merchant_store_id)
    REFERENCES public.manual_shipping_quote_requests(id, company_id, merchant_store_id) ON DELETE CASCADE,
  CONSTRAINT msqri_profile_tenancy_fk FOREIGN KEY (shipping_profile_id, company_id, merchant_store_id)
    REFERENCES public.merchant_store_sku_shipping_profiles(id, company_id, merchant_store_id) ON DELETE RESTRICT,
  CONSTRAINT msqri_line_uk UNIQUE (manual_shipping_quote_request_id, line_number),
  CONSTRAINT msqri_profile_uk UNIQUE (manual_shipping_quote_request_id, shipping_profile_id),
  CONSTRAINT msqri_line_ck CHECK (line_number > 0),
  CONSTRAINT msqri_quantity_ck CHECK (quantity > 0 AND quantity <= 100000)
);
COMMENT ON TABLE public.manual_shipping_quote_request_items IS
  'M1C-1E-C. Requested quantity per exact store-SKU shipping profile version. No product name, description, price, tax or inventory reservation is stored or implied.';

-- --------------------------------------------------------------- packages
CREATE TABLE public.manual_shipping_quote_request_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_shipping_quote_request_id uuid NOT NULL
    REFERENCES public.manual_shipping_quote_requests(id) ON DELETE CASCADE,
  package_number integer NOT NULL,
  package_count integer NOT NULL,
  weight_grams integer NOT NULL,
  length_mm integer NOT NULL,
  width_mm integer NOT NULL,
  height_mm integer NOT NULL,
  source_shipping_package_id uuid NULL
    REFERENCES public.merchant_store_sku_shipping_packages(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msqrp_number_uk UNIQUE (manual_shipping_quote_request_id, package_number),
  CONSTRAINT msqrp_number_ck CHECK (package_number > 0),
  CONSTRAINT msqrp_count_ck CHECK (package_count > 0 AND package_count <= 10000),
  CONSTRAINT msqrp_weight_ck CHECK (weight_grams > 0 AND weight_grams <= 2000000),
  CONSTRAINT msqrp_length_ck CHECK (length_mm > 0 AND length_mm <= 20000),
  CONSTRAINT msqrp_width_ck CHECK (width_mm > 0 AND width_mm <= 20000),
  CONSTRAINT msqrp_height_ck CHECK (height_mm > 0 AND height_mm <= 20000)
);
COMMENT ON TABLE public.manual_shipping_quote_request_packages IS
  'M1C-1E-C. Normalised physical package snapshot that the manual quote will be priced against. Authoritative even if the source package definition later changes. No JSONB, no carrier data, no price.';

CREATE INDEX msqr_family_idx ON public.manual_shipping_quote_requests (request_family_id);
CREATE INDEX msqri_request_idx ON public.manual_shipping_quote_request_items (manual_shipping_quote_request_id);
CREATE INDEX msqrp_request_idx ON public.manual_shipping_quote_request_packages (manual_shipping_quote_request_id);

-- =====================================================================
-- GUARDS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.m1c1ec_guard_submission_integrity(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  r public.manual_shipping_quote_requests%ROWTYPE;
  v_units integer;
  v_rows integer;
  v_bad integer;
BEGIN
  SELECT * INTO r FROM public.manual_shipping_quote_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1EC: request not found'; END IF;

  IF r.requested_at IS NULL THEN
    RAISE EXCEPTION 'M1C1EC: requested_at is mandatory on submission';
  END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at <= r.requested_at THEN
    RAISE EXCEPTION 'M1C1EC: expires_at must be later than requested_at';
  END IF;

  -- destination version must be active and its parent must not be retired
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_delivery_destination_versions v
    JOIN public.customer_delivery_destinations d
      ON d.id = v.customer_delivery_destination_id
     AND d.buyer_principal_id = v.buyer_principal_id
    WHERE v.id = r.delivery_destination_version_id
      AND v.buyer_principal_id = r.buyer_principal_id
      AND v.status = 'active'
      AND d.status <> 'retired'
  ) THEN
    RAISE EXCEPTION 'M1C1EC: destination version must be active, buyer-owned and not retired';
  END IF;

  -- exact active origin
  IF r.fulfillment_origin_id IS NULL THEN
    RAISE EXCEPTION 'M1C1EC: exact fulfillment origin is mandatory on submission';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_fulfillment_origins o
    WHERE o.id = r.fulfillment_origin_id
      AND o.company_id = r.company_id
      AND o.merchant_store_id = r.merchant_store_id
      AND o.status = 'active'
  ) THEN
    RAISE EXCEPTION 'M1C1EC: fulfillment origin must be active and belong to the same company and store';
  END IF;

  -- items
  SELECT count(*) INTO v_rows FROM public.manual_shipping_quote_request_items
   WHERE manual_shipping_quote_request_id = r.id;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'M1C1EC: at least one request item is required on submission';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.manual_shipping_quote_request_items i
  JOIN public.merchant_store_sku_shipping_profiles p ON p.id = i.shipping_profile_id
  WHERE i.manual_shipping_quote_request_id = r.id
    AND (p.company_id <> r.company_id OR p.merchant_store_id <> r.merchant_store_id
         OR p.status <> 'active');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M1C1EC: every item shipping profile must be active and belong to the same store';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.manual_shipping_quote_request_items i
  JOIN public.merchant_store_sku_shipping_profiles p ON p.id = i.shipping_profile_id
  WHERE i.manual_shipping_quote_request_id = r.id
    AND (p.pickup_only OR p.dangerous_goods OR p.handling_class = 'cold_chain');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M1C1EC: pickup-only, dangerous-goods and cold-chain items fail closed for manual quote requests';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.manual_shipping_quote_request_items i
  WHERE i.manual_shipping_quote_request_id = r.id
    AND NOT EXISTS (
      SELECT 1 FROM public.merchant_store_sku_fulfillment_origins e
      WHERE e.shipping_profile_id = i.shipping_profile_id
        AND e.fulfillment_origin_id = r.fulfillment_origin_id
        AND e.status = 'active');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M1C1EC: every item must be eligible for the exact fulfillment origin';
  END IF;

  -- packages
  SELECT count(*), coalesce(sum(package_count),0)
    INTO v_rows, v_units
  FROM public.manual_shipping_quote_request_packages
  WHERE manual_shipping_quote_request_id = r.id;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'M1C1EC: at least one package row is required on submission';
  END IF;

  IF r.shipment_form = 'parcel' AND (v_rows <> 1 OR v_units <> 1) THEN
    RAISE EXCEPTION 'M1C1EC: parcel requires exactly one package row with package_count = 1';
  END IF;
  IF r.shipment_form = 'multi_parcel' AND v_units < 2 THEN
    RAISE EXCEPTION 'M1C1EC: multi_parcel requires at least two physical units';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ec_guard_request_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  s public.manual_shipping_quote_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'M1C1EC: every manual quote request must be created in draft';
    END IF;
    IF NEW.requested_at IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'M1C1EC: draft requests carry no requested_at or expires_at';
    END IF;
  END IF;

  IF NEW.supersedes_request_id IS NOT NULL THEN
    SELECT * INTO s FROM public.manual_shipping_quote_requests WHERE id = NEW.supersedes_request_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C1EC: superseded request does not exist';
    END IF;
    IF s.buyer_principal_id <> NEW.buyer_principal_id
       OR s.company_id <> NEW.company_id
       OR s.merchant_store_id <> NEW.merchant_store_id
       OR s.currency_code <> NEW.currency_code
       OR s.request_family_id <> NEW.request_family_id THEN
      RAISE EXCEPTION 'M1C1EC: supersession must stay within the same buyer, company, store, currency and request family';
    END IF;
    IF NEW.version_number <= s.version_number THEN
      RAISE EXCEPTION 'M1C1EC: a superseding request must carry a strictly higher version number';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'draft' THEN
      IF NEW.company_id <> OLD.company_id
         OR NEW.merchant_store_id <> OLD.merchant_store_id
         OR NEW.buyer_principal_id <> OLD.buyer_principal_id
         OR NEW.delivery_destination_version_id <> OLD.delivery_destination_version_id
         OR NEW.fulfillment_origin_id IS DISTINCT FROM OLD.fulfillment_origin_id
         OR NEW.shipment_form <> OLD.shipment_form
         OR NEW.currency_code <> OLD.currency_code
         OR NEW.version_number <> OLD.version_number
         OR NEW.request_family_id <> OLD.request_family_id
         OR NEW.supersedes_request_id IS DISTINCT FROM OLD.supersedes_request_id
         OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
        RAISE EXCEPTION 'M1C1EC: submitted request business fields are immutable; issue a new request version';
      END IF;
    END IF;

    IF OLD.status IN ('accepted','declined','expired','cancelled') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'M1C1EC: terminal manual quote requests are historical and immutable';
    END IF;

    IF NEW.status <> OLD.status THEN
      IF NOT (
        (OLD.status = 'draft'        AND NEW.status IN ('requested','cancelled'))
     OR (OLD.status = 'requested'    AND NEW.status IN ('under_review','cancelled','expired'))
     OR (OLD.status = 'under_review' AND NEW.status IN ('quoted','cancelled','expired'))
     OR (OLD.status = 'quoted'       AND NEW.status IN ('accepted','declined','cancelled','expired'))
      ) THEN
        RAISE EXCEPTION 'M1C1EC: illegal manual quote request status transition % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ec_guard_request_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.status = 'requested' AND OLD.status = 'draft' THEN
    PERFORM public.m1c1ec_guard_submission_integrity(NEW.id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ec_guard_item_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_status text;
  v_req uuid;
BEGIN
  v_req := coalesce(NEW.manual_shipping_quote_request_id, OLD.manual_shipping_quote_request_id);
  SELECT status INTO v_status FROM public.manual_shipping_quote_requests WHERE id = v_req;
  IF v_status IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C1EC: request items are immutable once the request leaves draft; issue a new request version';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ec_guard_package_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_status text;
  v_req uuid;
BEGIN
  v_req := coalesce(NEW.manual_shipping_quote_request_id, OLD.manual_shipping_quote_request_id);
  SELECT status INTO v_status FROM public.manual_shipping_quote_requests WHERE id = v_req;
  IF v_status IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C1EC: request packages are immutable once the request leaves draft; issue a new request version';
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.source_shipping_package_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.merchant_store_sku_shipping_packages sp
      JOIN public.manual_shipping_quote_request_items i
        ON i.shipping_profile_id = sp.shipping_profile_id
       AND i.manual_shipping_quote_request_id = NEW.manual_shipping_quote_request_id
      WHERE sp.id = NEW.source_shipping_package_id
    ) THEN
      RAISE EXCEPTION 'M1C1EC: source package must belong to a shipping profile present in this request';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$fn$;

CREATE TRIGGER m1c1ec_request_write_trg
  BEFORE INSERT OR UPDATE ON public.manual_shipping_quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ec_guard_request_write();

CREATE CONSTRAINT TRIGGER m1c1ec_request_submission_trg
  AFTER UPDATE ON public.manual_shipping_quote_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ec_guard_request_submission();

CREATE TRIGGER m1c1ec_item_write_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_request_items
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ec_guard_item_write();

CREATE TRIGGER m1c1ec_package_write_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_request_packages
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ec_guard_package_write();

-- =====================================================================
-- RLS: enabled + forced, zero policies
-- =====================================================================
ALTER TABLE public.manual_shipping_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_request_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_request_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_request_packages FORCE ROW LEVEL SECURITY;

-- =====================================================================
-- EXPLICIT ACL NORMALIZATION (owner-only, zero grants)
-- =====================================================================
DO $$
DECLARE r record; roles text[] := ARRAY['PUBLIC','anon','authenticated','service_role','sandbox_exec'];
        rl text;
BEGIN
  FOR r IN SELECT c.oid::regclass::text AS rel
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relkind IN ('r','p')
             AND c.relname LIKE 'manual_shipping_quote_request%'
  LOOP
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %s', r.rel, rl);
    END LOOP;
  END LOOP;

  FOR r IN SELECT p.oid::regprocedure::text AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE 'm1c1ec_guard_%'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, rl);
    END LOOP;
  END LOOP;
END $$;