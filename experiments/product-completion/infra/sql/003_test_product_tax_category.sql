-- ISOLATED TEST DB ONLY; apply after 001/002. Never run against Lovable production.
BEGIN;
ALTER TABLE borvat.products ADD COLUMN IF NOT EXISTS tax_category text NOT NULL DEFAULT 'standard'
 CHECK(tax_category IN ('standard','reduced','zero'));
-- Draft orders are not payments. Capture/settlement requires a separately approved PSP workflow.
COMMIT;
