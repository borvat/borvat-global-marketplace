-- M1B-3C-6 — CURRENT NL/BE TAX RATE DRAFT SEED (data only, one-shot, fail-closed)
DO $$
DECLARE
  v_bands int;
  v_draft int;
  v_sum bigint;
  v_role text;
  v_priv text;
  v_tab text;
  v_band uuid;
  v_cat text;
  v_seed record;
  v_count int;
  v_inserted int := 0;
BEGIN
  -- 5.1 emptiness assertions
  SELECT (SELECT count(*) FROM public.tax_rate_versions)
       + (SELECT count(*) FROM public.catalog_product_tax_classifications)
       + (SELECT count(*) FROM public.company_tax_profiles)
       + (SELECT count(*) FROM public.merchant_store_offer_prices)
       + (SELECT count(*) FROM public.borvat_direct_listing_publications)
    INTO v_sum;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'M1B-3C-6 abort: tax/pricing/publication tables not empty (sum=%)', v_sum;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'draft') INTO v_bands, v_draft FROM public.tax_rate_bands;
  IF v_bands <> 9 OR v_draft <> 9 THEN
    RAISE EXCEPTION 'M1B-3C-6 abort: expected 9 draft bands, found % bands / % draft', v_bands, v_draft;
  END IF;

  -- 5.2 ACL assertion: no direct DML/SELECT for APPLICATION roles on the 7 tables.
  -- NOTE (R-T19): the platform re-grants `sandbox_exec` SELECT+INSERT on every public table
  -- after each migration (schema default ACL owned by postgres). That role is not an
  -- application role and is not reachable from the app; the re-grant is recorded as a
  -- residual risk in M1B-3C-6 instead of being asserted away here.
  FOREACH v_tab IN ARRAY ARRAY[
    'public.tax_categories','public.tax_rate_bands','public.tax_rate_versions',
    'public.catalog_product_tax_classifications','public.company_tax_profiles',
    'public.merchant_store_offer_prices','public.borvat_direct_listing_publications'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['public','anon','authenticated','service_role'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
        IF has_table_privilege(v_role, v_tab, v_priv) THEN
          RAISE EXCEPTION 'M1B-3C-6 abort: ACL drift — % holds % on %', v_role, v_priv, v_tab;
        END IF;
      END LOOP;
    END LOOP;
    FOREACH v_priv IN ARRAY ARRAY['UPDATE','DELETE','TRUNCATE'] LOOP
      IF has_table_privilege('sandbox_exec', v_tab, v_priv) THEN
        RAISE EXCEPTION 'M1B-3C-6 abort: ACL drift — sandbox_exec holds % on %', v_priv, v_tab;
      END IF;
    END LOOP;
  END LOOP;

  -- 1./3. seed set: band resolved by (country_code, band_code); never by hardcoded uuid
  FOR v_seed IN
    SELECT * FROM (VALUES
      ('NL','STANDARD',  2100, 'standard',
        'Wet op de omzetbelasting 1968, art. 9(1) — wetten.overheid.nl BWBR0002629 (Geldend van 01-01-2026); current-rate confirmation: Belastingdienst (official administrative), retrieved 2026-07-26. Historical commencement UNVERIFIED (M1B-3C-2).'),
      ('NL','REDUCED_A',  900, 'reduced',
        'Wet op de omzetbelasting 1968, art. 9(2)(a) + Tabel I — wetten.overheid.nl BWBR0002629; current-rate confirmation: Belastingdienst (official administrative) incl. btw-logies 9%→21% per 2026-01-01, and Eerste Kamer wetsvoorstel 36.814 (cancellation of the 2026 culture/media/sport increase), retrieved 2026-07-26. Historical commencement UNVERIFIED (M1B-3C-2).'),
      ('BE','STANDARD',  2100, 'standard',
        'Koninklijk Besluit nr. 20 van 20.07.1970, art. 1 al. 1 — Justel numac 1970072012 (ejustice.just.fgov.be, official consolidated record, retrieved 2026-07-26); current-rate confirmation: belgium.be/fr/impots/tva/taux (official Belgian government portal). Historical commencement UNVERIFIED (M1B-3C-2).'),
      ('BE','REDUCED_A',  600, 'reduced',
        'Koninklijk Besluit nr. 20 van 20.07.1970, art. 1 al. 2 a) + Tabel A — Justel numac 1970072012 (ejustice.just.fgov.be, official, retrieved 2026-07-26); current-rate confirmation: belgium.be/fr/impots/tva/taux (official). Historical commencement UNVERIFIED; consolidated Table A version identifier unresolved (M1B-3C-2).'),
      ('BE','REDUCED_B', 1200, 'reduced',
        'Koninklijk Besluit nr. 20 van 20.07.1970, art. 1 al. 2 b) + Tabel B — Justel numac 1970072012 (ejustice.just.fgov.be, official, retrieved 2026-07-26); current-rate confirmation: belgium.be/fr/impots/tva/taux (official). Historical commencement UNVERIFIED; 2025 coal reclassification (FPS Finance) not retrievable at official tier (M1B-3C-2).')
    ) AS s(country_code, band_code, rate_bp, expected_category, source_ref)
  LOOP
    SELECT count(*) INTO v_count
    FROM public.tax_rate_bands b
    WHERE b.country_code = v_seed.country_code AND b.band_code = v_seed.band_code;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'M1B-3C-6 abort: band %/% resolved to % rows', v_seed.country_code, v_seed.band_code, v_count;
    END IF;

    SELECT b.id, c.code INTO v_band, v_cat
    FROM public.tax_rate_bands b
    JOIN public.tax_categories c ON c.id = b.tax_category_id
    WHERE b.country_code = v_seed.country_code AND b.band_code = v_seed.band_code AND b.status = 'draft';
    IF v_band IS NULL THEN
      RAISE EXCEPTION 'M1B-3C-6 abort: band %/% not found in draft status', v_seed.country_code, v_seed.band_code;
    END IF;
    IF v_cat <> v_seed.expected_category THEN
      RAISE EXCEPTION 'M1B-3C-6 abort: band %/% treatment mismatch (expected %, found %)',
        v_seed.country_code, v_seed.band_code, v_seed.expected_category, v_cat;
    END IF;

    IF EXISTS (SELECT 1 FROM public.tax_rate_versions WHERE tax_rate_band_id = v_band) THEN
      RAISE EXCEPTION 'M1B-3C-6 abort: rate version already exists for %/%', v_seed.country_code, v_seed.band_code;
    END IF;

    INSERT INTO public.tax_rate_versions (
      tax_rate_band_id, country_code, rate_basis_points,
      platform_valid_from, platform_valid_to,
      status, legal_effective_from, legal_effective_to,
      legal_effective_date_status, legal_source_reference,
      verified_at, verified_by, notes
    ) VALUES (
      v_band, v_seed.country_code, v_seed.rate_bp,
      DATE '2026-07-26', NULL,
      'draft', NULL, NULL,
      'unverified', v_seed.source_ref,
      NULL, NULL,
      'M1B-3C-6 draft seed (BOR-DEC-056). platform_valid_from is the earliest operational date Borvat may use this version AFTER approval; it is NOT a legal commencement date and never drives historical recalculation. Not usable in pricing/checkout while status=draft.'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted <> 5 THEN
    RAISE EXCEPTION 'M1B-3C-6 abort: expected 5 inserts, performed %', v_inserted;
  END IF;

  IF (SELECT count(*) FROM public.tax_rate_versions) <> 5
     OR (SELECT count(*) FROM public.tax_rate_versions WHERE status <> 'draft') <> 0
     OR (SELECT count(*) FROM public.tax_rate_versions
         WHERE platform_valid_from <> DATE '2026-07-26'
            OR platform_valid_to IS NOT NULL
            OR legal_effective_from IS NOT NULL
            OR legal_effective_to IS NOT NULL
            OR legal_effective_date_status <> 'unverified'
            OR verified_at IS NOT NULL
            OR verified_by IS NOT NULL
            OR legal_source_reference IS NULL) <> 0 THEN
    RAISE EXCEPTION 'M1B-3C-6 abort: post-seed invariant violated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tax_rate_versions v
    JOIN public.tax_rate_bands b ON b.id = v.tax_rate_band_id
    JOIN public.tax_categories c ON c.id = b.tax_category_id
    WHERE c.code NOT IN ('standard','reduced')
  ) THEN
    RAISE EXCEPTION 'M1B-3C-6 abort: zero/exempt rate version present';
  END IF;
END
$$;