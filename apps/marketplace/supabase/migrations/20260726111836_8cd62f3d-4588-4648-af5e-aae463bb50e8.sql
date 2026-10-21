-- M1B-3C-1 — NL/BE JURISDICTION RATE-BAND DRAFT SEED
-- Bands only. No tax_rate_versions. No rates. No effective dates.
INSERT INTO public.tax_rate_bands (country_code, band_code, tax_category_id, display_name, description, status)
SELECT v.country_code, v.band_code, tc.id, v.display_name, v.description, 'draft'
FROM (VALUES
  ('NL','STANDARD',  'standard','Netherlands standard band',            'Jurisdiction band identity for the Dutch standard VAT treatment. No rate or effective date established.'),
  ('NL','REDUCED_A', 'reduced', 'Netherlands reduced band',             'Jurisdiction band identity for the single Dutch reduced VAT treatment. No rate or effective date established.'),
  ('NL','ZERO',      'zero',    'Netherlands zero-rated band',          'Jurisdiction band identity for Dutch zero-rated (taxable, reportable) treatment. No rate or effective date established.'),
  ('NL','EXEMPT',    'exempt',  'Netherlands exempt band',              'Jurisdiction band identity for Dutch VAT-exempt treatment (not zero-rated). No rate or effective date established.'),
  ('BE','STANDARD',  'standard','Belgium standard band',                'Jurisdiction band identity for the Belgian standard VAT treatment. No rate or effective date established.'),
  ('BE','REDUCED_A', 'reduced', 'Belgium reduced band — Table A',       'Jurisdiction band identity for the Belgian reduced treatment governed by Table A of KB nr. 20. No rate or effective date established.'),
  ('BE','REDUCED_B', 'reduced', 'Belgium reduced band — Table B',       'Jurisdiction band identity for the Belgian reduced treatment governed by Table B of KB nr. 20. No rate or effective date established.'),
  ('BE','ZERO',      'zero',    'Belgium zero-rated band',              'Jurisdiction band identity for Belgian zero-rated (taxable, reportable) treatment. No rate or effective date established.'),
  ('BE','EXEMPT',    'exempt',  'Belgium exempt band',                  'Jurisdiction band identity for Belgian VAT-exempt treatment (not zero-rated). No rate or effective date established.')
) AS v(country_code, band_code, category_code, display_name, description)
JOIN public.tax_categories tc ON tc.code = v.category_code
ON CONFLICT (country_code, band_code) DO NOTHING;

DO $$
DECLARE
  v_bands int; v_draft int; v_versions int; v_cls int; v_profiles int; v_prices int; v_bad int;
BEGIN
  SELECT count(*) INTO v_bands FROM public.tax_rate_bands;
  SELECT count(*) INTO v_draft FROM public.tax_rate_bands WHERE status = 'draft';
  SELECT count(*) INTO v_versions FROM public.tax_rate_versions;
  SELECT count(*) INTO v_cls FROM public.catalog_product_tax_classifications;
  SELECT count(*) INTO v_profiles FROM public.company_tax_profiles;
  SELECT count(*) INTO v_prices FROM public.merchant_store_offer_prices;
  SELECT count(*) INTO v_bad FROM public.tax_rate_bands WHERE band_code ~ '[0-9]';
  IF v_bands <> 9 OR v_draft <> 9 THEN
    RAISE EXCEPTION 'M1B3C1: expected 9 draft bands, got bands=% draft=%', v_bands, v_draft;
  END IF;
  IF v_versions <> 0 OR v_cls <> 0 OR v_profiles <> 0 OR v_prices <> 0 THEN
    RAISE EXCEPTION 'M1B3C1: downstream tables must remain empty (versions=% cls=% profiles=% prices=%)', v_versions, v_cls, v_profiles, v_prices;
  END IF;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'M1B3C1: band_code must not encode a numeric rate';
  END IF;
  IF (SELECT count(*) FROM public.tax_rate_bands b JOIN public.tax_categories c ON c.id = b.tax_category_id
      WHERE (b.band_code = 'STANDARD' AND c.code <> 'standard')
         OR (b.band_code LIKE 'REDUCED%' AND c.code <> 'reduced')
         OR (b.band_code = 'ZERO' AND c.code <> 'zero')
         OR (b.band_code = 'EXEMPT' AND c.code <> 'exempt')) <> 0 THEN
    RAISE EXCEPTION 'M1B3C1: treatment mapping mismatch';
  END IF;
  IF (SELECT count(*) FROM public.tax_rate_bands WHERE country_code = 'BE' AND band_code LIKE 'REDUCED%') <> 2
     OR (SELECT count(*) FROM public.tax_rate_bands WHERE country_code = 'NL' AND band_code LIKE 'REDUCED%') <> 1 THEN
    RAISE EXCEPTION 'M1B3C1: reduced-band cardinality mismatch';
  END IF;
END $$;