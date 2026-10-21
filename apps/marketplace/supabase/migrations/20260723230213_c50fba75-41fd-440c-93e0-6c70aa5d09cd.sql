
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
    SELECT count(*)::int INTO _match_count
    FROM public.channel_ean_map
    WHERE company_id = _batch.company_id AND ean = _ean;
    IF _match_count = 1 THEN
      SELECT sku_id INTO _suggested
      FROM public.channel_ean_map
      WHERE company_id = _batch.company_id AND ean = _ean
      LIMIT 1;
    END IF;
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
