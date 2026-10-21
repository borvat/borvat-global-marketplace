-- ===========================================================================
-- PHASE 2 MIGRATION 1
-- Catalog (products, SKUs, offers/composition), warehouses, locations,
-- canonical inventory dispositions, Phase 2 permission seeds, RLS, GRANTs,
-- indexes and enforcement triggers.
-- ===========================================================================

CREATE TYPE public.p2_offer_type AS ENUM ('simple','pack','bundle');
CREATE TYPE public.p2_tracking_mode AS ENUM ('none','lot','serial');
CREATE TYPE public.p2_lifecycle_status AS ENUM ('draft','active','inactive','archived');

CREATE TABLE public.catalog_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  title        text NOT NULL CHECK (length(trim(title)) > 0),
  brand        text,
  description  text,
  category_id  uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  status       public.p2_lifecycle_status NOT NULL DEFAULT 'draft',
  created_by   uuid REFERENCES auth.users(id),
  updated_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_products_company_idx ON public.catalog_products(company_id);
CREATE INDEX catalog_products_status_idx  ON public.catalog_products(company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_products TO authenticated;
GRANT ALL ON public.catalog_products TO service_role;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_products_read ON public.catalog_products FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY catalog_products_write ON public.catalog_products FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE POLICY catalog_products_update ON public.catalog_products FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE POLICY catalog_products_delete ON public.catalog_products FOR DELETE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE TRIGGER catalog_products_touch BEFORE UPDATE ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.catalog_skus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  product_id     uuid REFERENCES public.catalog_products(id) ON DELETE SET NULL,
  code           text NOT NULL CHECK (length(trim(code)) > 0),
  tracking_mode  public.p2_tracking_mode NOT NULL DEFAULT 'none',
  status         public.p2_lifecycle_status NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_skus_company_code_uidx ON public.catalog_skus (company_id, lower(code));
CREATE INDEX catalog_skus_product_idx ON public.catalog_skus(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_skus TO authenticated;
GRANT ALL ON public.catalog_skus TO service_role;
ALTER TABLE public.catalog_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_skus_read ON public.catalog_skus FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY catalog_skus_write ON public.catalog_skus FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE POLICY catalog_skus_update ON public.catalog_skus FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE POLICY catalog_skus_delete ON public.catalog_skus FOR DELETE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE TRIGGER catalog_skus_touch BEFORE UPDATE ON public.catalog_skus
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.p2_immutable_company_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.p2_immutable_company_id() FROM PUBLIC;
CREATE TRIGGER catalog_products_immutable_company BEFORE UPDATE ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();
CREATE TRIGGER catalog_skus_immutable_company BEFORE UPDATE ON public.catalog_skus
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();

CREATE OR REPLACE FUNCTION public.p2_skus_validate_product()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _prod_company uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT company_id INTO _prod_company FROM public.catalog_products WHERE id = NEW.product_id;
  IF _prod_company IS NULL THEN RAISE EXCEPTION 'product % not found', NEW.product_id; END IF;
  IF _prod_company <> NEW.company_id THEN
    RAISE EXCEPTION 'product % belongs to a different company', NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.p2_skus_validate_product() FROM PUBLIC;
CREATE TRIGGER catalog_skus_validate_product
  BEFORE INSERT OR UPDATE OF product_id, company_id ON public.catalog_skus
  FOR EACH ROW EXECUTE FUNCTION public.p2_skus_validate_product();

CREATE TABLE public.catalog_offers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  product_id          uuid REFERENCES public.catalog_products(id) ON DELETE SET NULL,
  offer_type          public.p2_offer_type NOT NULL,
  base_sku_id         uuid REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  quantity_per_offer  integer NOT NULL DEFAULT 1,
  status              public.p2_lifecycle_status NOT NULL DEFAULT 'draft',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_offers_qty_positive CHECK (quantity_per_offer >= 1),
  CONSTRAINT catalog_offers_simple_shape CHECK (
    offer_type <> 'simple' OR (base_sku_id IS NOT NULL AND quantity_per_offer = 1)
  ),
  CONSTRAINT catalog_offers_pack_shape CHECK (
    offer_type <> 'pack' OR (base_sku_id IS NOT NULL AND quantity_per_offer >= 1)
  ),
  CONSTRAINT catalog_offers_bundle_shape CHECK (
    offer_type <> 'bundle' OR (base_sku_id IS NULL AND quantity_per_offer = 1)
  )
);
CREATE INDEX catalog_offers_company_idx ON public.catalog_offers(company_id);
CREATE INDEX catalog_offers_base_sku_idx ON public.catalog_offers(base_sku_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_offers TO authenticated;
GRANT ALL ON public.catalog_offers TO service_role;
ALTER TABLE public.catalog_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_offers_read ON public.catalog_offers FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY catalog_offers_write ON public.catalog_offers FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE POLICY catalog_offers_update ON public.catalog_offers FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE POLICY catalog_offers_delete ON public.catalog_offers FOR DELETE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'catalog.manage'));
CREATE TRIGGER catalog_offers_touch BEFORE UPDATE ON public.catalog_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER catalog_offers_immutable_company BEFORE UPDATE ON public.catalog_offers
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();

CREATE OR REPLACE FUNCTION public.p2_offers_immutable_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.offer_type IS DISTINCT FROM OLD.offer_type THEN
    RAISE EXCEPTION 'offer_type is immutable after creation';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.p2_offers_immutable_type() FROM PUBLIC;
CREATE TRIGGER catalog_offers_immutable_type BEFORE UPDATE ON public.catalog_offers
  FOR EACH ROW EXECUTE FUNCTION public.p2_offers_immutable_type();

CREATE OR REPLACE FUNCTION public.p2_offers_validate_refs()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _sku_company uuid; _prod_company uuid;
BEGIN
  IF NEW.base_sku_id IS NOT NULL THEN
    SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = NEW.base_sku_id;
    IF _sku_company IS NULL OR _sku_company <> NEW.company_id THEN
      RAISE EXCEPTION 'base_sku_id % is not in the same company', NEW.base_sku_id;
    END IF;
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    SELECT company_id INTO _prod_company FROM public.catalog_products WHERE id = NEW.product_id;
    IF _prod_company IS NULL OR _prod_company <> NEW.company_id THEN
      RAISE EXCEPTION 'product_id % is not in the same company', NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.p2_offers_validate_refs() FROM PUBLIC;
CREATE TRIGGER catalog_offers_validate_refs
  BEFORE INSERT OR UPDATE OF base_sku_id, product_id, company_id ON public.catalog_offers
  FOR EACH ROW EXECUTE FUNCTION public.p2_offers_validate_refs();

CREATE TABLE public.catalog_offer_components (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id            uuid NOT NULL REFERENCES public.catalog_offers(id) ON DELETE CASCADE,
  sku_id              uuid NOT NULL REFERENCES public.catalog_skus(id) ON DELETE RESTRICT,
  quantity_per_offer  integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_offer_components_qty_positive CHECK (quantity_per_offer >= 1)
);
CREATE UNIQUE INDEX catalog_offer_components_offer_sku_uidx
  ON public.catalog_offer_components(offer_id, sku_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_offer_components TO authenticated;
GRANT ALL ON public.catalog_offer_components TO service_role;
ALTER TABLE public.catalog_offer_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_components_read ON public.catalog_offer_components FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.catalog_offers o WHERE o.id = catalog_offer_components.offer_id
    AND public.is_company_member(o.company_id, auth.uid())));
CREATE POLICY offer_components_write ON public.catalog_offer_components FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.catalog_offers o WHERE o.id = catalog_offer_components.offer_id
    AND public.company_member_has_permission(o.company_id, auth.uid(), 'catalog.manage')));
CREATE POLICY offer_components_update ON public.catalog_offer_components FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.catalog_offers o WHERE o.id = catalog_offer_components.offer_id
    AND public.company_member_has_permission(o.company_id, auth.uid(), 'catalog.manage')));
CREATE POLICY offer_components_delete ON public.catalog_offer_components FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.catalog_offers o WHERE o.id = catalog_offer_components.offer_id
    AND public.company_member_has_permission(o.company_id, auth.uid(), 'catalog.manage')));

CREATE OR REPLACE FUNCTION public.p2_offer_components_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _offer_type public.p2_offer_type; _offer_company uuid; _sku_company uuid;
BEGIN
  SELECT offer_type, company_id INTO _offer_type, _offer_company
  FROM public.catalog_offers WHERE id = NEW.offer_id;
  IF _offer_type IS NULL THEN RAISE EXCEPTION 'offer % not found', NEW.offer_id; END IF;
  IF _offer_type <> 'bundle' THEN
    RAISE EXCEPTION 'components are only allowed on bundle offers';
  END IF;
  SELECT company_id INTO _sku_company FROM public.catalog_skus WHERE id = NEW.sku_id;
  IF _sku_company IS NULL OR _sku_company <> _offer_company THEN
    RAISE EXCEPTION 'component sku % is not in the same company as offer %', NEW.sku_id, NEW.offer_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.p2_offer_components_validate() FROM PUBLIC;
CREATE TRIGGER offer_components_validate BEFORE INSERT OR UPDATE ON public.catalog_offer_components
  FOR EACH ROW EXECUTE FUNCTION public.p2_offer_components_validate();

CREATE TABLE public.warehouses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code               text NOT NULL CHECK (length(trim(code)) > 0),
  name               text NOT NULL CHECK (length(trim(name)) > 0),
  requires_location  boolean NOT NULL DEFAULT false,
  status             public.p2_lifecycle_status NOT NULL DEFAULT 'active',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX warehouses_company_code_uidx ON public.warehouses (company_id, lower(code));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY warehouses_read ON public.warehouses FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY warehouses_write ON public.warehouses FOR INSERT TO authenticated
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'warehouses.manage'));
CREATE POLICY warehouses_update ON public.warehouses FOR UPDATE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'warehouses.manage'))
  WITH CHECK (public.company_member_has_permission(company_id, auth.uid(), 'warehouses.manage'));
CREATE POLICY warehouses_delete ON public.warehouses FOR DELETE TO authenticated
  USING (public.company_member_has_permission(company_id, auth.uid(), 'warehouses.manage'));
CREATE TRIGGER warehouses_touch BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER warehouses_immutable_company BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_company_id();

CREATE TABLE public.warehouse_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  code          text NOT NULL CHECK (length(trim(code)) > 0),
  status        public.p2_lifecycle_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX warehouse_locations_wh_code_uidx ON public.warehouse_locations(warehouse_id, lower(code));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_locations TO authenticated;
GRANT ALL ON public.warehouse_locations TO service_role;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY wloc_read ON public.warehouse_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_locations.warehouse_id
    AND public.is_company_member(w.company_id, auth.uid())));
CREATE POLICY wloc_write ON public.warehouse_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_locations.warehouse_id
    AND public.company_member_has_permission(w.company_id, auth.uid(), 'warehouses.manage')));
CREATE POLICY wloc_update ON public.warehouse_locations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_locations.warehouse_id
    AND public.company_member_has_permission(w.company_id, auth.uid(), 'warehouses.manage')));
CREATE POLICY wloc_delete ON public.warehouse_locations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_locations.warehouse_id
    AND public.company_member_has_permission(w.company_id, auth.uid(), 'warehouses.manage')));
CREATE TRIGGER wloc_touch BEFORE UPDATE ON public.warehouse_locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.p2_immutable_warehouse_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN
    RAISE EXCEPTION 'warehouse_id is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.p2_immutable_warehouse_id() FROM PUBLIC;
CREATE TRIGGER wloc_immutable_warehouse BEFORE UPDATE ON public.warehouse_locations
  FOR EACH ROW EXECUTE FUNCTION public.p2_immutable_warehouse_id();

CREATE TABLE public.inventory_dispositions (
  key           text PRIMARY KEY,
  description   text NOT NULL,
  is_physical   boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.inventory_dispositions TO authenticated;
GRANT SELECT ON public.inventory_dispositions TO anon;
GRANT ALL    ON public.inventory_dispositions TO service_role;
ALTER TABLE public.inventory_dispositions ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_disp_read ON public.inventory_dispositions FOR SELECT USING (true);

INSERT INTO public.inventory_dispositions(key, description, sort_order) VALUES
  ('sellable',                    'Physically held sellable inventory',        10),
  ('picked',                      'Picked for a specific fulfilment',          20),
  ('packed_or_staging',           'Packed / staging for shipment',             30),
  ('in_transfer',                 'Held in warehouse-to-warehouse transfer',   40),
  ('returned_pending_inspection', 'Returned by customer, awaiting inspection', 50),
  ('quarantine',                  'Held in quarantine',                        60),
  ('damaged',                     'Damaged, held on-hand',                     70);

INSERT INTO public.permissions(key, description) VALUES
  ('warehouses.read',        'Read warehouses and locations'),
  ('inventory.transfer',     'Post warehouse-to-warehouse transfers'),
  ('inventory.reverse',      'Reverse posted inventory transactions'),
  ('inventory.disposal',     'Dispose or write off inventory'),
  ('reservations.read',      'Read reservations'),
  ('reservations.manage',    'Create, release and manage reservations'),
  ('reservations.override',  'Override or forcibly release reservations'),
  ('fulfilment.pick',        'Perform pick movements'),
  ('fulfilment.pack',        'Perform pack / staging movements'),
  ('fulfilment.ship',        'Perform ship (external issue) movements'),
  ('fulfilment.return',      'Receive and process returns'),
  ('channels.read',          'Read channel accounts and listings'),
  ('channels.activate',      'Activate or deactivate channel accounts / listings'),
  ('exceptions.read',        'Read inventory exceptions'),
  ('exceptions.resolve',     'Resolve inventory exceptions')
ON CONFLICT (key) DO NOTHING;

WITH r AS (SELECT id, key FROM public.system_company_roles),
     p AS (SELECT id, key FROM public.permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r, p
WHERE (r.key, p.key) IN (
  ('owner','warehouses.read'),('owner','inventory.transfer'),('owner','inventory.reverse'),
  ('owner','inventory.disposal'),('owner','reservations.read'),('owner','reservations.manage'),
  ('owner','reservations.override'),('owner','fulfilment.pick'),('owner','fulfilment.pack'),
  ('owner','fulfilment.ship'),('owner','fulfilment.return'),('owner','channels.read'),
  ('owner','channels.activate'),('owner','exceptions.read'),('owner','exceptions.resolve'),
  ('admin','warehouses.read'),('admin','inventory.transfer'),('admin','inventory.reverse'),
  ('admin','inventory.disposal'),('admin','reservations.read'),('admin','reservations.manage'),
  ('admin','fulfilment.pick'),('admin','fulfilment.pack'),('admin','fulfilment.ship'),
  ('admin','fulfilment.return'),('admin','channels.read'),('admin','channels.activate'),
  ('admin','exceptions.read'),('admin','exceptions.resolve'),
  ('manager','warehouses.read'),('manager','inventory.transfer'),
  ('manager','reservations.read'),('manager','reservations.manage'),
  ('manager','fulfilment.pick'),('manager','fulfilment.pack'),('manager','fulfilment.ship'),
  ('manager','fulfilment.return'),('manager','channels.read'),
  ('manager','exceptions.read'),('manager','exceptions.resolve'),
  ('operator','warehouses.read'),('operator','reservations.read'),
  ('operator','fulfilment.pick'),('operator','fulfilment.pack'),('operator','fulfilment.ship'),
  ('operator','fulfilment.return'),('operator','exceptions.read'),
  ('viewer','warehouses.read'),('viewer','reservations.read'),
  ('viewer','channels.read'),('viewer','exceptions.read')
)
ON CONFLICT DO NOTHING;
