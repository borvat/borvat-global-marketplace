-- ============================================================================
-- M1B-2B — TAX FOUNDATION SCHEMA AND READ-ONLY BASELINE
-- Owner authorization: OPTION 1 — INSTALL btree_gist AND COMPLETE M1B-2B ATOMICALLY
-- Decision: BOR-DEC-046 (tax foundation) + BOR-DEC-047 (btree_gist authorization)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extension: btree_gist in dedicated `extensions` schema
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 2. Enums (idempotent guards)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.tax_rate_status AS ENUM ('draft','approved','superseded','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tax_classification_status AS ENUM ('proposed','approved','superseded','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. tax_categories — canonical taxonomy (no rates)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tax_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE
                  CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  label         text NOT NULL CHECK (length(label) BETWEEN 1 AND 128),
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tax_categories TO authenticated;
GRANT ALL    ON public.tax_categories TO service_role;

ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_categories FORCE  ROW LEVEL SECURITY;

CREATE POLICY tax_categories_read_authenticated
  ON public.tax_categories FOR SELECT
  TO authenticated
  USING (true);

-- Canonical taxonomy rows only (labels, not rates). Not "active tax data".
INSERT INTO public.tax_categories (code, label, description) VALUES
  ('standard', 'Standard rate',  'Default VAT rate applied unless a specific reduced/zero/exempt classification is approved.'),
  ('reduced',  'Reduced rate',   'Reduced VAT rate for eligible product categories per destination law.'),
  ('zero',     'Zero rate',      'Zero-rated supplies (rate = 0, still taxable and reportable).'),
  ('exempt',   'Exempt',         'Exempt from VAT (out of scope, not zero-rated).');

-- ---------------------------------------------------------------------------
-- 4. tax_rate_versions — effective-dated, country-specific, lifecycle-managed
-- ---------------------------------------------------------------------------
CREATE TABLE public.tax_rate_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code        text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  tax_category_id     uuid NOT NULL REFERENCES public.tax_categories(id) ON DELETE RESTRICT,
  rate_basis_points   integer NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 100000),
  valid_from          date NOT NULL,
  valid_to            date,
  status              public.tax_rate_status NOT NULL DEFAULT 'draft',
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rate_versions_valid_range
    CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT tax_rate_versions_approved_requires_approver
    CHECK (
      (status <> 'approved')
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE INDEX tax_rate_versions_country_category_idx
  ON public.tax_rate_versions (country_code, tax_category_id);
CREATE INDEX tax_rate_versions_status_idx
  ON public.tax_rate_versions (status);

-- Exclusion constraint: no two APPROVED windows may overlap for the same
-- (country_code, tax_category_id). Uses btree_gist for the equality parts.
ALTER TABLE public.tax_rate_versions
  ADD CONSTRAINT tax_rate_versions_no_active_overlap
  EXCLUDE USING gist (
    country_code     WITH =,
    tax_category_id  WITH =,
    daterange(valid_from, valid_to, '[)') WITH &&
  )
  WHERE (status = 'approved');

GRANT SELECT ON public.tax_rate_versions TO authenticated;
GRANT ALL    ON public.tax_rate_versions TO service_role;

ALTER TABLE public.tax_rate_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rate_versions FORCE  ROW LEVEL SECURITY;

CREATE POLICY tax_rate_versions_read_admin_only
  ON public.tax_rate_versions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------------
-- 5. catalog_product_tax_classifications — product × destination × window
-- ---------------------------------------------------------------------------
CREATE TABLE public.catalog_product_tax_classifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
  country_code        text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  tax_category_id     uuid NOT NULL REFERENCES public.tax_categories(id) ON DELETE RESTRICT,
  valid_from          date NOT NULL,
  valid_to            date,
  status              public.tax_classification_status NOT NULL DEFAULT 'proposed',
  notes               text,
  proposed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_product_tax_classifications_valid_range
    CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT catalog_product_tax_classifications_approved_requires_approver
    CHECK (
      (status <> 'approved')
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE INDEX cptc_product_country_idx
  ON public.catalog_product_tax_classifications (product_id, country_code);
CREATE INDEX cptc_status_idx
  ON public.catalog_product_tax_classifications (status);

-- Exclusion constraint: no two APPROVED classifications may overlap for
-- the same (product_id, country_code).
ALTER TABLE public.catalog_product_tax_classifications
  ADD CONSTRAINT cptc_no_active_overlap
  EXCLUDE USING gist (
    product_id    WITH =,
    country_code  WITH =,
    daterange(valid_from, valid_to, '[)') WITH &&
  )
  WHERE (status = 'approved');

GRANT SELECT ON public.catalog_product_tax_classifications TO authenticated;
GRANT ALL    ON public.catalog_product_tax_classifications TO service_role;

ALTER TABLE public.catalog_product_tax_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_product_tax_classifications FORCE  ROW LEVEL SECURITY;

CREATE POLICY cptc_read_admin_only
  ON public.catalog_product_tax_classifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------------
-- 6. company_tax_profiles — VAT identity per Company
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_tax_profiles (
  company_id     uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  legal_name     text CHECK (legal_name IS NULL OR length(legal_name) BETWEEN 1 AND 256),
  vat_country    text CHECK (vat_country IS NULL OR vat_country ~ '^[A-Z]{2}$'),
  vat_number     text CHECK (vat_number IS NULL OR vat_number ~ '^[A-Z0-9]{4,20}$'),
  verified       boolean NOT NULL DEFAULT false,
  verified_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_tax_profiles_verified_requires_verifier
    CHECK (
      (verified = false)
      OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
    ),
  CONSTRAINT company_tax_profiles_vat_pair
    CHECK (
      (vat_number IS NULL AND vat_country IS NULL)
      OR (vat_number IS NOT NULL AND vat_country IS NOT NULL)
    )
);

GRANT SELECT ON public.company_tax_profiles TO authenticated;
GRANT ALL    ON public.company_tax_profiles TO service_role;

ALTER TABLE public.company_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_tax_profiles FORCE  ROW LEVEL SECURITY;

-- Seller: can read only their own company's tax profile.
CREATE POLICY company_tax_profiles_read_own_company
  ON public.company_tax_profiles FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

-- Platform Admin: can read all tax profiles.
CREATE POLICY company_tax_profiles_read_admin
  ON public.company_tax_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers on all four tables
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_tax_categories_updated_at
  BEFORE UPDATE ON public.tax_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tax_rate_versions_updated_at
  BEFORE UPDATE ON public.tax_rate_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cptc_updated_at
  BEFORE UPDATE ON public.catalog_product_tax_classifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_company_tax_profiles_updated_at
  BEFORE UPDATE ON public.company_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. Belt-and-braces: revoke from PUBLIC / anon / sandbox_exec
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.tax_categories                        FROM PUBLIC, anon;
REVOKE ALL ON public.tax_rate_versions                     FROM PUBLIC, anon;
REVOKE ALL ON public.catalog_product_tax_classifications   FROM PUBLIC, anon;
REVOKE ALL ON public.company_tax_profiles                  FROM PUBLIC, anon;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON public.tax_categories                       FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON public.tax_rate_versions                    FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON public.catalog_product_tax_classifications  FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON public.company_tax_profiles                 FROM sandbox_exec';
  END IF;
END $$;
