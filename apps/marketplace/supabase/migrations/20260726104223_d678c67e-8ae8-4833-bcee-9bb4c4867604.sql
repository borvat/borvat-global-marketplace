
-- =========================================================================
-- M1B-2D — Jurisdiction tax rate-band schema correction
-- Atomic: single migration; hard-fail if any dependent table is non-empty.
-- No real VAT rates, no bands, no classifications, no company profiles, no
-- prices are inserted. This is a schema/integrity correction only.
-- =========================================================================

-- Guard: preconditions --------------------------------------------------------
DO $$
DECLARE
  c_trv int; c_cptc int; c_ctp int; c_msop int; c_bands int;
BEGIN
  SELECT count(*) INTO c_trv FROM public.tax_rate_versions;
  SELECT count(*) INTO c_cptc FROM public.catalog_product_tax_classifications;
  SELECT count(*) INTO c_ctp FROM public.company_tax_profiles;
  SELECT count(*) INTO c_msop FROM public.merchant_store_offer_prices;
  IF c_trv+c_cptc+c_ctp+c_msop > 0 THEN
    RAISE EXCEPTION 'M1B-2D precondition failed: non-empty dependent tables (trv=%, cptc=%, ctp=%, msop=%)',
      c_trv, c_cptc, c_ctp, c_msop;
  END IF;
  -- tax_rate_bands must not pre-exist
  SELECT count(*) INTO c_bands FROM information_schema.tables
    WHERE table_schema='public' AND table_name='tax_rate_bands';
  IF c_bands > 0 THEN
    RAISE EXCEPTION 'M1B-2D precondition failed: public.tax_rate_bands already exists';
  END IF;
END $$;

-- Documentation: tax_categories is a treatment taxonomy, NOT a rate band ------
COMMENT ON TABLE public.tax_categories IS
  'GLOBAL LEGAL TAX TREATMENT TAXONOMY. Rows describe general legal tax '
  'treatments (e.g. standard, reduced, zero_rated, exempt). They do NOT '
  'represent jurisdiction-specific rate bands or percentages. Country-'
  'specific bands live in public.tax_rate_bands; percentages live in '
  'public.tax_rate_versions.';
COMMENT ON COLUMN public.tax_categories.code  IS 'Treatment code (global). Not a jurisdiction rate band.';
COMMENT ON COLUMN public.tax_categories.label IS 'Human label for the treatment taxonomy row.';

-- =========================================================================
-- 1. Create tax_rate_bands
-- =========================================================================
CREATE TABLE public.tax_rate_bands (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code     text NOT NULL,
  band_code        text NOT NULL,
  tax_category_id  uuid NOT NULL REFERENCES public.tax_categories(id) ON DELETE RESTRICT,
  display_name     text NOT NULL,
  description      text NULL,
  status           text NOT NULL DEFAULT 'draft',
  version          bigint NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rate_bands_country_format CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT tax_rate_bands_band_code_format CHECK (band_code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  CONSTRAINT tax_rate_bands_display_name_len CHECK (length(display_name) BETWEEN 1 AND 128),
  CONSTRAINT tax_rate_bands_status_check CHECK (status IN ('draft','active','retired')),
  CONSTRAINT tax_rate_bands_version_positive CHECK (version >= 1),
  CONSTRAINT tax_rate_bands_country_band_unique UNIQUE (country_code, band_code),
  -- composite target for classifications' composite FK
  CONSTRAINT tax_rate_bands_id_country_unique UNIQUE (id, country_code)
);

COMMENT ON TABLE public.tax_rate_bands IS
  'Jurisdiction-specific legal tax rate band. Identity is (country_code, '
  'band_code). Percentages and effective dates live in tax_rate_versions '
  'so a band identity is stable across rate changes.';

CREATE INDEX tax_rate_bands_country_idx  ON public.tax_rate_bands(country_code);
CREATE INDEX tax_rate_bands_category_idx ON public.tax_rate_bands(tax_category_id);
CREATE INDEX tax_rate_bands_status_idx   ON public.tax_rate_bands(status);

CREATE TRIGGER trg_tax_rate_bands_updated_at
  BEFORE UPDATE ON public.tax_rate_bands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deny-all baseline: revoke, no policies, forced RLS
REVOKE ALL ON public.tax_rate_bands FROM PUBLIC;
REVOKE ALL ON public.tax_rate_bands FROM anon;
REVOKE ALL ON public.tax_rate_bands FROM authenticated;
REVOKE ALL ON public.tax_rate_bands FROM service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON public.tax_rate_bands FROM sandbox_exec';
  END IF;
END $$;

ALTER TABLE public.tax_rate_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rate_bands FORCE ROW LEVEL SECURITY;

-- =========================================================================
-- 2. Rewire tax_rate_versions: tax_category_id → tax_rate_band_id
-- =========================================================================
ALTER TABLE public.tax_rate_versions
  DROP CONSTRAINT tax_rate_versions_no_active_overlap;

ALTER TABLE public.tax_rate_versions
  DROP CONSTRAINT tax_rate_versions_tax_category_id_fkey;

ALTER TABLE public.tax_rate_versions
  DROP COLUMN tax_category_id;

ALTER TABLE public.tax_rate_versions
  ADD COLUMN tax_rate_band_id uuid NOT NULL
    REFERENCES public.tax_rate_bands(id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.tax_rate_versions_country_category_idx;
CREATE INDEX tax_rate_versions_country_band_idx
  ON public.tax_rate_versions(country_code, tax_rate_band_id);

-- New exclusion: no overlapping approved windows for the SAME band.
-- Country match with the band is enforced by the guard trigger below.
ALTER TABLE public.tax_rate_versions
  ADD CONSTRAINT tax_rate_versions_no_active_overlap
    EXCLUDE USING gist (
      tax_rate_band_id WITH =,
      daterange(valid_from, valid_to, '[)') WITH &&
    ) WHERE (status = 'approved');

-- Country coherence guard: rate country must equal band country.
CREATE OR REPLACE FUNCTION public.trg_tax_rate_versions_band_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_band_country text;
BEGIN
  SELECT country_code INTO v_band_country
    FROM public.tax_rate_bands WHERE id = NEW.tax_rate_band_id;
  IF v_band_country IS NULL THEN
    RAISE EXCEPTION 'tax_rate_versions: band % not found', NEW.tax_rate_band_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_band_country <> NEW.country_code THEN
    RAISE EXCEPTION 'tax_rate_versions: country % <> band country %',
      NEW.country_code, v_band_country
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.trg_tax_rate_versions_band_country() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_tax_rate_versions_band_country() FROM anon;
REVOKE ALL ON FUNCTION public.trg_tax_rate_versions_band_country() FROM authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.trg_tax_rate_versions_band_country() FROM sandbox_exec';
  END IF;
END $$;

CREATE TRIGGER trg_tax_rate_versions_band_country
  BEFORE INSERT OR UPDATE ON public.tax_rate_versions
  FOR EACH ROW EXECUTE FUNCTION public.trg_tax_rate_versions_band_country();

-- =========================================================================
-- 3. Rewire catalog_product_tax_classifications: category → band, composite FK
-- =========================================================================
ALTER TABLE public.catalog_product_tax_classifications
  DROP CONSTRAINT cptc_no_active_overlap;

ALTER TABLE public.catalog_product_tax_classifications
  DROP CONSTRAINT catalog_product_tax_classifications_tax_category_id_fkey;

ALTER TABLE public.catalog_product_tax_classifications
  DROP COLUMN tax_category_id;

ALTER TABLE public.catalog_product_tax_classifications
  ADD COLUMN tax_rate_band_id uuid NOT NULL;

-- Composite FK: classification's (band, country) must exist as a real band.
ALTER TABLE public.catalog_product_tax_classifications
  ADD CONSTRAINT cptc_band_country_fkey
    FOREIGN KEY (tax_rate_band_id, country_code)
    REFERENCES public.tax_rate_bands(id, country_code)
    ON DELETE RESTRICT;

CREATE INDEX cptc_band_idx
  ON public.catalog_product_tax_classifications(tax_rate_band_id);

-- Exclusion unchanged in scope: no overlapping approved classifications for
-- the same (product, country); different bands still cannot overlap.
ALTER TABLE public.catalog_product_tax_classifications
  ADD CONSTRAINT cptc_no_active_overlap
    EXCLUDE USING gist (
      product_id WITH =,
      country_code WITH =,
      daterange(valid_from, valid_to, '[)') WITH &&
    ) WHERE (status = 'approved');

-- =========================================================================
-- 4. Rewrite pricing tax-integrity guard to match on band, not category.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.msop_guard_tax_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_trv_country  text;
  v_trv_band     uuid;
  v_trv_status   public.tax_rate_status;
  v_trv_from     date;
  v_trv_to       date;
  v_product_id   uuid;
  v_cls_band     uuid;
  v_cls_country  text;
  v_cls_status   public.tax_classification_status;
  v_cls_from     date;
  v_cls_to       date;
  v_vf           date;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.tax_rate_version_id IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: active price requires tax_rate_version_id'
      USING ERRCODE = 'check_violation';
  END IF;

  v_vf := (NEW.valid_from AT TIME ZONE 'UTC')::date;

  SELECT country_code, tax_rate_band_id, status, valid_from, valid_to
    INTO v_trv_country, v_trv_band, v_trv_status, v_trv_from, v_trv_to
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

  SELECT tax_rate_band_id, country_code, status, valid_from, valid_to
    INTO v_cls_band, v_cls_country, v_cls_status, v_cls_from, v_cls_to
    FROM public.catalog_product_tax_classifications
   WHERE product_id = v_product_id
     AND country_code = NEW.destination_country_code
     AND status = 'approved'
     AND valid_from <= v_vf
     AND (valid_to IS NULL OR valid_to > v_vf)
   LIMIT 1;

  IF v_cls_band IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: no approved product tax classification for product % country % at %',
      v_product_id, NEW.destination_country_code, v_vf
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_cls_country <> NEW.destination_country_code THEN
    RAISE EXCEPTION 'msop_tax_guard: classification country <> price country'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_cls_band <> v_trv_band THEN
    RAISE EXCEPTION 'msop_tax_guard: classification band <> rate band (band mismatch)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

-- ACL hygiene for the rewritten guard
REVOKE ALL ON FUNCTION public.msop_guard_tax_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.msop_guard_tax_integrity() FROM anon;
REVOKE ALL ON FUNCTION public.msop_guard_tax_integrity() FROM authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.msop_guard_tax_integrity() FROM sandbox_exec';
  END IF;
END $$;
