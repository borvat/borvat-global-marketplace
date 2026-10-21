-- =====================================================================
-- M1C-1B — FULFILLMENT ORIGIN AND STORE-SKU SHIPPING PROFILE FOUNDATION
-- Schema foundation only. No routes, rates, quotes, messaging, UI, data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Composite uniqueness keys on EXISTING objects (additive, required
--    to prove cross-table tenancy declaratively via composite FKs).
-- ---------------------------------------------------------------------
ALTER TABLE public.merchant_stores
  ADD CONSTRAINT merchant_stores_id_company_uk UNIQUE (id, company_id);

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_id_company_uk UNIQUE (id, company_id);

ALTER TABLE public.catalog_skus
  ADD CONSTRAINT catalog_skus_id_company_uk UNIQUE (id, company_id);

ALTER TABLE public.warehouse_locations
  ADD CONSTRAINT warehouse_locations_id_warehouse_uk UNIQUE (id, warehouse_id);

-- ---------------------------------------------------------------------
-- 1. merchant_fulfillment_origins
-- ---------------------------------------------------------------------
CREATE TABLE public.merchant_fulfillment_origins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL,
  merchant_store_id     uuid NOT NULL,
  warehouse_id          uuid,
  warehouse_location_id uuid,
  origin_type           text NOT NULL,
  label                 text NOT NULL,
  country_code          text NOT NULL,
  postal_code           text,
  status                text NOT NULL DEFAULT 'draft',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mfo_company_fk
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT mfo_store_company_fk
    FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT mfo_warehouse_company_fk
    FOREIGN KEY (warehouse_id, company_id)
    REFERENCES public.warehouses(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT mfo_location_warehouse_fk
    FOREIGN KEY (warehouse_location_id, warehouse_id)
    REFERENCES public.warehouse_locations(id, warehouse_id) ON DELETE RESTRICT,

  CONSTRAINT mfo_origin_type_ck
    CHECK (origin_type IN ('warehouse','store','third_party_fulfillment')),
  CONSTRAINT mfo_status_ck
    CHECK (status IN ('draft','active','inactive','retired')),
  CONSTRAINT mfo_country_ck
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT mfo_label_ck
    CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT mfo_postal_ck
    CHECK (postal_code IS NULL OR length(btrim(postal_code)) BETWEEN 1 AND 20),
  CONSTRAINT mfo_location_requires_warehouse_ck
    CHECK (warehouse_location_id IS NULL OR warehouse_id IS NOT NULL),
  CONSTRAINT mfo_warehouse_type_ck
    CHECK (warehouse_id IS NULL OR origin_type = 'warehouse'),

  -- tenancy anchor for children
  CONSTRAINT mfo_id_company_store_uk UNIQUE (id, company_id, merchant_store_id)
);

CREATE INDEX mfo_store_ix ON public.merchant_fulfillment_origins (merchant_store_id);
CREATE INDEX mfo_company_ix ON public.merchant_fulfillment_origins (company_id);
CREATE INDEX mfo_status_ix ON public.merchant_fulfillment_origins (status);

-- ---------------------------------------------------------------------
-- 2. merchant_store_sku_shipping_profiles
-- ---------------------------------------------------------------------
CREATE TABLE public.merchant_store_sku_shipping_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL,
  merchant_store_id           uuid NOT NULL,
  catalog_sku_id              uuid NOT NULL,
  version                     integer NOT NULL DEFAULT 1,
  handling_class              text NOT NULL DEFAULT 'standard',
  oversized                   boolean NOT NULL DEFAULT false,
  dangerous_goods             boolean NOT NULL DEFAULT false,
  pickup_only                 boolean NOT NULL DEFAULT false,
  can_combine_with_other_items boolean NOT NULL DEFAULT true,
  status                      text NOT NULL DEFAULT 'draft',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mssp_company_fk
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT mssp_store_company_fk
    FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT mssp_sku_company_fk
    FOREIGN KEY (catalog_sku_id, company_id)
    REFERENCES public.catalog_skus(id, company_id) ON DELETE RESTRICT,

  CONSTRAINT mssp_status_ck
    CHECK (status IN ('draft','active','inactive','retired')),
  CONSTRAINT mssp_handling_class_ck
    CHECK (handling_class IN ('standard','fragile','bulky','cold_chain','high_value')),
  CONSTRAINT mssp_version_ck CHECK (version >= 1),
  CONSTRAINT mssp_pickup_combine_ck
    CHECK (NOT (pickup_only AND can_combine_with_other_items = false AND false)),

  CONSTRAINT mssp_store_sku_version_uk UNIQUE (merchant_store_id, catalog_sku_id, version),
  CONSTRAINT mssp_id_company_store_uk UNIQUE (id, company_id, merchant_store_id)
);

-- at most one operational (active) profile per store+SKU
CREATE UNIQUE INDEX mssp_one_active_per_store_sku_uidx
  ON public.merchant_store_sku_shipping_profiles (merchant_store_id, catalog_sku_id)
  WHERE status = 'active';

CREATE INDEX mssp_company_ix ON public.merchant_store_sku_shipping_profiles (company_id);
CREATE INDEX mssp_sku_ix ON public.merchant_store_sku_shipping_profiles (catalog_sku_id);

-- ---------------------------------------------------------------------
-- 3. merchant_store_sku_shipping_packages
-- ---------------------------------------------------------------------
CREATE TABLE public.merchant_store_sku_shipping_packages (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_profile_id        uuid NOT NULL,
  company_id                 uuid NOT NULL,
  merchant_store_id          uuid NOT NULL,
  package_number             integer NOT NULL,
  quantity_per_package       integer NOT NULL,
  weight_grams               integer NOT NULL,
  length_mm                  integer NOT NULL,
  width_mm                   integer NOT NULL,
  height_mm                  integer NOT NULL,
  stackable                  boolean NOT NULL DEFAULT true,
  requires_original_packaging boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT msspkg_profile_tenancy_fk
    FOREIGN KEY (shipping_profile_id, company_id, merchant_store_id)
    REFERENCES public.merchant_store_sku_shipping_profiles (id, company_id, merchant_store_id)
    ON DELETE CASCADE,

  CONSTRAINT msspkg_package_number_ck CHECK (package_number >= 1),
  CONSTRAINT msspkg_quantity_ck CHECK (quantity_per_package > 0),
  CONSTRAINT msspkg_weight_ck CHECK (weight_grams > 0),
  CONSTRAINT msspkg_length_ck CHECK (length_mm > 0),
  CONSTRAINT msspkg_width_ck CHECK (width_mm > 0),
  CONSTRAINT msspkg_height_ck CHECK (height_mm > 0),

  CONSTRAINT msspkg_profile_package_number_uk UNIQUE (shipping_profile_id, package_number)
);

CREATE INDEX msspkg_profile_ix ON public.merchant_store_sku_shipping_packages (shipping_profile_id);

-- ---------------------------------------------------------------------
-- 4. merchant_store_sku_fulfillment_origins (junction)
-- ---------------------------------------------------------------------
CREATE TABLE public.merchant_store_sku_fulfillment_origins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_profile_id   uuid NOT NULL,
  fulfillment_origin_id uuid NOT NULL,
  company_id            uuid NOT NULL,
  merchant_store_id     uuid NOT NULL,
  priority              integer NOT NULL,
  is_default            boolean NOT NULL DEFAULT false,
  status                text NOT NULL DEFAULT 'draft',
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT msfo_profile_tenancy_fk
    FOREIGN KEY (shipping_profile_id, company_id, merchant_store_id)
    REFERENCES public.merchant_store_sku_shipping_profiles (id, company_id, merchant_store_id)
    ON DELETE CASCADE,
  CONSTRAINT msfo_origin_tenancy_fk
    FOREIGN KEY (fulfillment_origin_id, company_id, merchant_store_id)
    REFERENCES public.merchant_fulfillment_origins (id, company_id, merchant_store_id)
    ON DELETE RESTRICT,

  CONSTRAINT msfo_status_ck CHECK (status IN ('draft','active','inactive','retired')),
  CONSTRAINT msfo_priority_ck CHECK (priority >= 1),

  CONSTRAINT msfo_profile_origin_uk UNIQUE (shipping_profile_id, fulfillment_origin_id),
  CONSTRAINT msfo_profile_priority_uk UNIQUE (shipping_profile_id, priority)
);

CREATE UNIQUE INDEX msfo_one_default_per_profile_uidx
  ON public.merchant_store_sku_fulfillment_origins (shipping_profile_id)
  WHERE is_default = true;

CREATE INDEX msfo_origin_ix ON public.merchant_store_sku_fulfillment_origins (fulfillment_origin_id);

-- ---------------------------------------------------------------------
-- 5. Integrity trigger (cross-table rule not expressible declaratively):
--    a retired origin may not be assigned to a profile.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1b_guard_origin_not_retired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT o.status INTO v_status
  FROM public.merchant_fulfillment_origins o
  WHERE o.id = NEW.fulfillment_origin_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'fulfillment origin % not found', NEW.fulfillment_origin_id
      USING ERRCODE = '23503';
  END IF;

  IF v_status = 'retired' THEN
    RAISE EXCEPTION 'retired fulfillment origin % cannot be assigned', NEW.fulfillment_origin_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.m1c1b_guard_origin_not_retired() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.m1c1b_guard_origin_not_retired() FROM PUBLIC;

CREATE TRIGGER msfo_origin_not_retired
  BEFORE INSERT OR UPDATE OF fulfillment_origin_id
  ON public.merchant_store_sku_fulfillment_origins
  FOR EACH ROW EXECUTE FUNCTION public.m1c1b_guard_origin_not_retired();

-- updated_at maintenance (reuse existing platform function)
CREATE TRIGGER mfo_touch BEFORE UPDATE ON public.merchant_fulfillment_origins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mssp_touch BEFORE UPDATE ON public.merchant_store_sku_shipping_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 6. RLS + FORCE RLS, zero policies, zero application grants
-- ---------------------------------------------------------------------
ALTER TABLE public.merchant_fulfillment_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_fulfillment_origins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_shipping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_shipping_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_shipping_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_shipping_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_fulfillment_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_fulfillment_origins FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.merchant_fulfillment_origins FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.merchant_store_sku_shipping_profiles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.merchant_store_sku_shipping_packages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.merchant_store_sku_fulfillment_origins FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.merchant_fulfillment_origins FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON TABLE public.merchant_store_sku_shipping_profiles FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON TABLE public.merchant_store_sku_shipping_packages FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON TABLE public.merchant_store_sku_fulfillment_origins FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.m1c1b_guard_origin_not_retired() FROM sandbox_exec';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.m1c1b_guard_origin_not_retired() FROM anon, authenticated, service_role;