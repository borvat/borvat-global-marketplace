-- =============================================================================
-- M1B-3B — MERCHANT STORE PRICING FOUNDATION
-- Schema + Integrity + RLS only. No data. No RPCs. No UI.
-- =============================================================================

-- 1. Table -------------------------------------------------------------------
CREATE TABLE public.merchant_store_offer_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_store_id uuid NOT NULL REFERENCES public.merchant_stores(id) ON DELETE RESTRICT,
  catalog_sku_id uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  destination_country_code text NOT NULL,
  currency_code text NOT NULL,
  gross_amount_minor bigint NOT NULL,
  tax_rate_version_id uuid NULL REFERENCES public.tax_rate_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NULL,
  supersedes_price_id uuid NULL REFERENCES public.merchant_store_offer_prices(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT msop_country_format CHECK (destination_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT msop_currency_format CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT msop_gross_positive CHECK (gross_amount_minor > 0),
  CONSTRAINT msop_status_check CHECK (status IN ('draft','active','superseded','withdrawn')),
  CONSTRAINT msop_valid_range CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT msop_no_self_supersession CHECK (supersedes_price_id IS NULL OR supersedes_price_id <> id),
  CONSTRAINT msop_version_positive CHECK (version >= 1)
);

CREATE INDEX msop_store_sku_idx
  ON public.merchant_store_offer_prices (merchant_store_id, catalog_sku_id);
CREATE INDEX msop_status_idx
  ON public.merchant_store_offer_prices (status);
CREATE INDEX msop_scope_idx
  ON public.merchant_store_offer_prices
     (merchant_store_id, catalog_sku_id, destination_country_code, currency_code);

-- 2. Exclusion constraint: no overlapping active windows in same scope ------
ALTER TABLE public.merchant_store_offer_prices
  ADD CONSTRAINT msop_no_active_overlap
  EXCLUDE USING gist (
    merchant_store_id WITH =,
    catalog_sku_id WITH =,
    destination_country_code WITH =,
    currency_code WITH =,
    tstzrange(valid_from, valid_to, '[)') WITH &&
  ) WHERE (status = 'active');

-- 3. updated_at touch --------------------------------------------------------
CREATE TRIGGER msop_touch_updated_at
  BEFORE UPDATE ON public.merchant_store_offer_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Store/SKU ownership guard ----------------------------------------------
CREATE OR REPLACE FUNCTION public.msop_guard_store_sku_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_company uuid;
  v_sku_company uuid;
  v_super_store uuid;
  v_super_sku uuid;
  v_super_country text;
  v_super_currency text;
BEGIN
  SELECT company_id INTO v_store_company
    FROM public.merchant_stores WHERE id = NEW.merchant_store_id;
  IF v_store_company IS NULL THEN
    RAISE EXCEPTION 'msop_guard: merchant_store % not found', NEW.merchant_store_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT company_id INTO v_sku_company
    FROM public.catalog_skus WHERE id = NEW.catalog_sku_id;
  IF v_sku_company IS NULL THEN
    RAISE EXCEPTION 'msop_guard: catalog_sku % not found', NEW.catalog_sku_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_store_company <> v_sku_company THEN
    RAISE EXCEPTION 'msop_guard: store/SKU cross-company mismatch (store_company=% sku_company=%)',
      v_store_company, v_sku_company
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.supersedes_price_id IS NOT NULL THEN
    SELECT merchant_store_id, catalog_sku_id, destination_country_code, currency_code
      INTO v_super_store, v_super_sku, v_super_country, v_super_currency
      FROM public.merchant_store_offer_prices
     WHERE id = NEW.supersedes_price_id;
    IF v_super_store IS NULL THEN
      RAISE EXCEPTION 'msop_guard: supersedes_price_id % not found', NEW.supersedes_price_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_super_store <> NEW.merchant_store_id
       OR v_super_sku <> NEW.catalog_sku_id
       OR v_super_country <> NEW.destination_country_code
       OR v_super_currency <> NEW.currency_code THEN
      RAISE EXCEPTION 'msop_guard: supersession scope mismatch'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.msop_guard_store_sku_ownership() FROM PUBLIC, anon, authenticated, sandbox_exec;

CREATE TRIGGER msop_guard_ownership
  BEFORE INSERT OR UPDATE ON public.merchant_store_offer_prices
  FOR EACH ROW EXECUTE FUNCTION public.msop_guard_store_sku_ownership();

-- 5. Tax integrity guard (only enforced when status='active') ---------------
CREATE OR REPLACE FUNCTION public.msop_guard_tax_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trv_country text;
  v_trv_category uuid;
  v_trv_status public.tax_rate_status;
  v_trv_from date;
  v_trv_to date;
  v_product_id uuid;
  v_cls_category uuid;
  v_cls_status public.tax_classification_status;
  v_cls_from date;
  v_cls_to date;
  v_vf date;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.tax_rate_version_id IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: active price requires tax_rate_version_id'
      USING ERRCODE = 'check_violation';
  END IF;

  v_vf := (NEW.valid_from AT TIME ZONE 'UTC')::date;

  SELECT country_code, tax_category_id, status, valid_from, valid_to
    INTO v_trv_country, v_trv_category, v_trv_status, v_trv_from, v_trv_to
    FROM public.tax_rate_versions
   WHERE id = NEW.tax_rate_version_id;

  IF v_trv_country IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: tax_rate_version % not found', NEW.tax_rate_version_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_trv_status <> 'approved' THEN
    RAISE EXCEPTION 'msop_tax_guard: tax_rate_version must be approved (was %)', v_trv_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_trv_country <> NEW.destination_country_code THEN
    RAISE EXCEPTION 'msop_tax_guard: tax rate country % <> price country %',
      v_trv_country, NEW.destination_country_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_vf < v_trv_from OR (v_trv_to IS NOT NULL AND v_vf >= v_trv_to) THEN
    RAISE EXCEPTION 'msop_tax_guard: tax rate not effective at valid_from'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT product_id INTO v_product_id
    FROM public.catalog_skus WHERE id = NEW.catalog_sku_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: SKU has no linked product; classification required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT tax_category_id, status, valid_from, valid_to
    INTO v_cls_category, v_cls_status, v_cls_from, v_cls_to
    FROM public.catalog_product_tax_classifications
   WHERE product_id = v_product_id
     AND country_code = NEW.destination_country_code
     AND status = 'approved'
     AND valid_from <= v_vf
     AND (valid_to IS NULL OR valid_to > v_vf)
   LIMIT 1;

  IF v_cls_category IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: no approved product tax classification for product % country % at %',
      v_product_id, NEW.destination_country_code, v_vf
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_cls_category <> v_trv_category THEN
    RAISE EXCEPTION 'msop_tax_guard: classification category <> rate category'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.msop_guard_tax_integrity() FROM PUBLIC, anon, authenticated, sandbox_exec;

CREATE TRIGGER msop_guard_tax
  BEFORE INSERT OR UPDATE ON public.merchant_store_offer_prices
  FOR EACH ROW EXECUTE FUNCTION public.msop_guard_tax_integrity();

-- 6. Active-row commercial immutability guard -------------------------------
CREATE OR REPLACE FUNCTION public.msop_guard_active_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'active' THEN
    IF NEW.merchant_store_id IS DISTINCT FROM OLD.merchant_store_id
       OR NEW.catalog_sku_id IS DISTINCT FROM OLD.catalog_sku_id
       OR NEW.destination_country_code IS DISTINCT FROM OLD.destination_country_code
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.gross_amount_minor IS DISTINCT FROM OLD.gross_amount_minor
       OR NEW.tax_rate_version_id IS DISTINCT FROM OLD.tax_rate_version_id
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
      RAISE EXCEPTION 'msop_immutable: cannot modify commercial fields of active price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status NOT IN ('active','superseded','withdrawn') THEN
      RAISE EXCEPTION 'msop_immutable: invalid status transition from active to %', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.msop_guard_active_immutable() FROM PUBLIC, anon, authenticated, sandbox_exec;

CREATE TRIGGER msop_guard_immutable
  BEFORE UPDATE ON public.merchant_store_offer_prices
  FOR EACH ROW EXECUTE FUNCTION public.msop_guard_active_immutable();

-- 7. RLS: forced, no policies (deny-all) ------------------------------------
ALTER TABLE public.merchant_store_offer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_offer_prices FORCE ROW LEVEL SECURITY;

-- 8. Grants: revoke everything, no direct DML for anyone --------------------
REVOKE ALL ON public.merchant_store_offer_prices FROM PUBLIC;
REVOKE ALL ON public.merchant_store_offer_prices FROM anon;
REVOKE ALL ON public.merchant_store_offer_prices FROM authenticated;
REVOKE ALL ON public.merchant_store_offer_prices FROM service_role;
REVOKE ALL ON public.merchant_store_offer_prices FROM sandbox_exec;
