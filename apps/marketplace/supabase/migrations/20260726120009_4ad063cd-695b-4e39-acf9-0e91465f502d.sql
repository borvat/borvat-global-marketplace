-- M1B-3C-4 — TAX TEMPORAL SEMANTICS SCHEMA CORRECTION
-- Schema + guard correction only. No data. No activation workflow.

DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.tax_rate_versions)
       + (SELECT count(*) FROM public.catalog_product_tax_classifications)
       + (SELECT count(*) FROM public.company_tax_profiles)
       + (SELECT count(*) FROM public.merchant_store_offer_prices)
       + (SELECT count(*) FROM public.borvat_direct_listing_publications)
    INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'M1B-3C-4 aborted: expected 0 rows across tax/pricing/publication tables, found %', n;
  END IF;
END $$;

-- 1. Rename operational temporal columns
ALTER TABLE public.tax_rate_versions RENAME COLUMN valid_from TO platform_valid_from;
ALTER TABLE public.tax_rate_versions RENAME COLUMN valid_to   TO platform_valid_to;

-- 2. Legal-history metadata (optional, non-operational)
ALTER TABLE public.tax_rate_versions
  ADD COLUMN legal_effective_from date NULL,
  ADD COLUMN legal_effective_to   date NULL,
  ADD COLUMN legal_effective_date_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN legal_source_reference text NULL,
  ADD COLUMN verified_at timestamptz NULL,
  ADD COLUMN verified_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tax_rate_versions
  ADD CONSTRAINT tax_rate_versions_legal_status_allowlist
    CHECK (legal_effective_date_status IN ('unverified','verified','conflicting')),
  ADD CONSTRAINT tax_rate_versions_legal_to_requires_from
    CHECK (legal_effective_to IS NULL OR legal_effective_from IS NOT NULL),
  ADD CONSTRAINT tax_rate_versions_legal_range
    CHECK (legal_effective_from IS NULL OR legal_effective_to IS NULL
           OR legal_effective_to > legal_effective_from),
  ADD CONSTRAINT tax_rate_versions_legal_verified_requires_evidence
    CHECK (
      legal_effective_date_status <> 'verified'
      OR (
        legal_effective_from IS NOT NULL
        AND legal_source_reference IS NOT NULL
        AND length(btrim(legal_source_reference)) > 0
        AND verified_at IS NOT NULL
        AND verified_by IS NOT NULL
      )
    );

-- 3. Platform window contract (rebuilt on renamed columns)
ALTER TABLE public.tax_rate_versions DROP CONSTRAINT tax_rate_versions_valid_range;
ALTER TABLE public.tax_rate_versions
  ADD CONSTRAINT tax_rate_versions_platform_range
    CHECK (platform_valid_to IS NULL OR platform_valid_to > platform_valid_from);

-- 4. Exclusion constraint rebuilt on the renamed platform window.
--    Range type stays daterange: the columns are `date`, and date -> timestamptz
--    is only STABLE, so tstzrange() is not index-immutable and cannot be used in
--    an exclusion constraint. Status predicate preserved verbatim ('approved').
ALTER TABLE public.tax_rate_versions DROP CONSTRAINT tax_rate_versions_no_active_overlap;
ALTER TABLE public.tax_rate_versions
  ADD CONSTRAINT tax_rate_versions_no_platform_overlap
    EXCLUDE USING gist (
      tax_rate_band_id WITH =,
      daterange(platform_valid_from, platform_valid_to, '[)') WITH &&
    ) WHERE (status = 'approved'::public.tax_rate_status);

-- 5. Pricing guard rewritten against platform validity + B2C treatment allowlist
CREATE OR REPLACE FUNCTION public.msop_guard_tax_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_trv_country   text;
  v_trv_band      uuid;
  v_trv_status    public.tax_rate_status;
  v_pf_from       date;
  v_pf_to         date;
  v_treatment     text;
  v_product_id    uuid;
  v_cls_band      uuid;
  v_cls_country   text;
  v_cls_from      date;
  v_cls_to        date;
  v_vf            date;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.tax_rate_version_id IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: active price requires tax_rate_version_id'
      USING ERRCODE = 'check_violation';
  END IF;

  v_vf := (NEW.valid_from AT TIME ZONE 'UTC')::date;

  SELECT v.country_code, v.tax_rate_band_id, v.status,
         v.platform_valid_from, v.platform_valid_to, c.code
    INTO v_trv_country, v_trv_band, v_trv_status, v_pf_from, v_pf_to, v_treatment
    FROM public.tax_rate_versions v
    JOIN public.tax_rate_bands b ON b.id = v.tax_rate_band_id
    JOIN public.tax_categories c ON c.id = b.tax_category_id
   WHERE v.id = NEW.tax_rate_version_id;

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

  -- B2C baseline treatment allowlist (R-T17): zero_rated / exempt are transaction
  -- contextual and remain excluded until the transaction-treatment design exists.
  IF v_treatment NOT IN ('standard','reduced') THEN
    RAISE EXCEPTION 'msop_tax_guard: treatment % not permitted in B2C baseline price activation', v_treatment
      USING ERRCODE = 'check_violation';
  END IF;

  -- No backdating: a price may never start before platform validity begins.
  IF v_vf < v_pf_from THEN
    RAISE EXCEPTION 'msop_tax_guard: price valid_from % precedes rate platform_valid_from % (no backdating)',
      v_vf, v_pf_from
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ended platform window cannot back a new price.
  IF v_pf_to IS NOT NULL AND v_vf >= v_pf_to THEN
    RAISE EXCEPTION 'msop_tax_guard: rate not platform-valid at price valid_from (window ended %)', v_pf_to
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.product_id INTO v_product_id
    FROM public.catalog_skus s WHERE s.id = NEW.catalog_sku_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'msop_tax_guard: SKU has no linked product; classification required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Product-scope validity is independent of rate platform validity.
  SELECT k.tax_rate_band_id, k.country_code, k.valid_from, k.valid_to
    INTO v_cls_band, v_cls_country, v_cls_from, v_cls_to
    FROM public.catalog_product_tax_classifications k
   WHERE k.product_id = v_product_id
     AND k.country_code = NEW.destination_country_code
     AND k.status = 'approved'
     AND k.valid_from <= v_vf
     AND (k.valid_to IS NULL OR k.valid_to > v_vf)
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
END $function$;

-- 6. Binding documentation of meaning
COMMENT ON COLUMN public.tax_rate_versions.platform_valid_from IS
  'PLATFORM VALIDITY (operational): first date Borvat may apply this rate version to new transactions/orders. NOT a legal commencement date and must never be presented as one. Never earlier than Owner approval.';
COMMENT ON COLUMN public.tax_rate_versions.platform_valid_to IS
  'PLATFORM VALIDITY (operational, exclusive end): after this date the rate version may not back new transactions/orders. NOT a legal end date. Editing legal metadata never changes this window.';
COMMENT ON COLUMN public.tax_rate_versions.legal_effective_from IS
  'OPTIONAL HISTORICAL METADATA: proven statutory commencement date. NULL means the historical date has not yet been proven inside Borvat — it does NOT mean the rate lacks a legal basis. Never used in any computation and never copied from platform dates.';
COMMENT ON COLUMN public.tax_rate_versions.legal_effective_to IS
  'OPTIONAL HISTORICAL METADATA: proven statutory end date. NULL means unproven, not absent. Display/audit only.';
COMMENT ON COLUMN public.tax_rate_versions.legal_effective_date_status IS
  'Evidence state of the legal metadata: unverified | verified | conflicting. ''verified'' requires legal_effective_from, a non-empty legal_source_reference, verified_at and verified_by. Never affects checkout arithmetic.';
COMMENT ON COLUMN public.tax_rate_versions.legal_source_reference IS
  'OPTIONAL HISTORICAL METADATA: citation (act/article/official URL) supporting the legal dates. Audit only.';
COMMENT ON COLUMN public.tax_rate_versions.verified_at IS
  'Timestamp at which the legal citation was checked. Explicitly NOT a legal date.';
COMMENT ON COLUMN public.tax_rate_versions.verified_by IS
  'User who checked the legal citation. Audit only.';
COMMENT ON CONSTRAINT tax_rate_versions_no_platform_overlap ON public.tax_rate_versions IS
  'Prevents overlapping operational (approved) platform windows for the same tax_rate_band_id; different bands are independent. daterange is used because the columns are date and tstzrange() over date is not index-immutable.';
COMMENT ON FUNCTION public.msop_guard_tax_integrity() IS
  'Pricing tax guard: enforces platform validity (no backdating, no ended window), destination match, band match, product classification window, and the B2C baseline treatment allowlist (standard|reduced only). Never reads legal_effective_* metadata.';
COMMENT ON TABLE public.tax_rate_versions IS
  'Rate percentage per tax rate band over time. Platform validity governs operational use; legal_effective_* columns are optional historical metadata only. Product membership of a band lives solely in catalog_product_tax_classifications.';

-- 7. ACL hygiene forced by the correction: application roles must hold no DML here.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tax_rate_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tax_rate_versions FROM service_role;
REVOKE ALL ON public.tax_rate_versions FROM PUBLIC;
REVOKE ALL ON public.tax_rate_versions FROM anon;
GRANT SELECT ON public.tax_rate_versions TO authenticated;
GRANT SELECT ON public.tax_rate_versions TO service_role;
REVOKE EXECUTE ON FUNCTION public.msop_guard_tax_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.msop_guard_tax_integrity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.msop_guard_tax_integrity() FROM authenticated;