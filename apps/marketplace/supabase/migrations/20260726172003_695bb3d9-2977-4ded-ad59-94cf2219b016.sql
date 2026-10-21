-- M1C-1E-B — AUTHORITATIVE DELIVERY DESTINATION FOUNDATION (schema only)
-- Owner-only. Zero grants. No RPC, no views, no data.

-- 1. Logical destination -------------------------------------------------
CREATE TABLE public.customer_delivery_destinations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_principal_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdd_status_ck CHECK (status = ANY (ARRAY['active','inactive','retired'])),
  CONSTRAINT cdd_buyer_identity_uq UNIQUE (id, buyer_principal_id)
);

COMMENT ON TABLE public.customer_delivery_destinations IS
  'M1C-1E-B: buyer-owned logical delivery destination (BOR-DEC-106). No address data here. Owner-only; sellers never receive direct access (BOR-DEC-108).';
COMMENT ON COLUMN public.customer_delivery_destinations.buyer_principal_id IS
  'Buyer principal = public.profiles(id) -> auth.users(id). Never an email or free-text identity.';

-- 2. Immutable destination versions --------------------------------------
CREATE TABLE public.customer_delivery_destination_versions (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_delivery_destination_id  uuid NOT NULL,
  buyer_principal_id                uuid NOT NULL,
  version_number                    integer NOT NULL,
  precision_level                   text NOT NULL,
  country_code                      text NOT NULL,
  postal_code                       text NOT NULL,
  postal_code_normalized            text NOT NULL,
  region                            text,
  city                              text NOT NULL,
  street_name                       text,
  house_number                      text,
  address_unit                      text,
  destination_type                  text NOT NULL,
  floor_level                       integer,
  elevator_access                   text NOT NULL DEFAULT 'unknown',
  lift_gate_requirement             text NOT NULL DEFAULT 'unknown',
  delivery_appointment_requirement  text NOT NULL DEFAULT 'unknown',
  status                            text NOT NULL DEFAULT 'draft',
  supersedes_version_id             uuid REFERENCES public.customer_delivery_destination_versions(id) ON DELETE RESTRICT,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cddv_parent_tenancy_fk FOREIGN KEY (customer_delivery_destination_id, buyer_principal_id)
    REFERENCES public.customer_delivery_destinations (id, buyer_principal_id) ON DELETE RESTRICT,
  CONSTRAINT cddv_version_number_ck CHECK (version_number > 0),
  CONSTRAINT cddv_version_uq UNIQUE (customer_delivery_destination_id, version_number),
  CONSTRAINT cddv_precision_ck CHECK (precision_level = ANY (ARRAY['quote_area','street_address'])),
  CONSTRAINT cddv_status_ck CHECK (status = ANY (ARRAY['draft','active','superseded','retired'])),
  CONSTRAINT cddv_country_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT cddv_postal_raw_ck CHECK (postal_code = btrim(postal_code) AND length(postal_code) > 0),
  CONSTRAINT cddv_postal_normalized_ck CHECK (
    length(postal_code_normalized) > 0
    AND postal_code_normalized = upper(regexp_replace(postal_code, '[^A-Za-z0-9]', '', 'g'))
  ),
  CONSTRAINT cddv_city_ck CHECK (length(btrim(city)) > 0),
  CONSTRAINT cddv_region_ck CHECK (region IS NULL OR length(btrim(region)) > 0),
  CONSTRAINT cddv_destination_type_ck CHECK (destination_type = ANY (ARRAY['residential','business'])),
  CONSTRAINT cddv_elevator_ck CHECK (elevator_access = ANY (ARRAY['unknown','available','unavailable','not_applicable'])),
  CONSTRAINT cddv_lift_gate_ck CHECK (lift_gate_requirement = ANY (ARRAY['unknown','required','not_required'])),
  CONSTRAINT cddv_appointment_ck CHECK (delivery_appointment_requirement = ANY (ARRAY['unknown','required','not_required'])),
  CONSTRAINT cddv_floor_range_ck CHECK (floor_level IS NULL OR (floor_level >= -10 AND floor_level <= 200)),
  CONSTRAINT cddv_precision_shape_ck CHECK (
    (precision_level = 'quote_area'
       AND street_name IS NULL AND house_number IS NULL AND address_unit IS NULL)
    OR
    (precision_level = 'street_address'
       AND street_name IS NOT NULL AND length(btrim(street_name)) > 0
       AND house_number IS NOT NULL AND length(btrim(house_number)) > 0
       AND (address_unit IS NULL OR length(btrim(address_unit)) > 0))
  ),
  CONSTRAINT cddv_supersedes_self_ck CHECK (supersedes_version_id IS NULL OR supersedes_version_id <> id)
);

CREATE UNIQUE INDEX cddv_single_active_uq
  ON public.customer_delivery_destination_versions (customer_delivery_destination_id)
  WHERE status = 'active';

CREATE INDEX cddv_destination_idx
  ON public.customer_delivery_destination_versions (customer_delivery_destination_id, version_number);

COMMENT ON TABLE public.customer_delivery_destination_versions IS
  'M1C-1E-B: immutable versioned delivery destination data (BOR-DEC-106/107). Consumers (quotes, checkout groups, orders, labels) MUST pin this version id, never the parent destination (BOR-DEC-109). No contact identity or free-form instructions (BOR-DEC-110).';
COMMENT ON COLUMN public.customer_delivery_destination_versions.precision_level IS
  'quote_area = country/postal/city/type only; street_address = full street data. street_address does NOT imply carrier verification.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.country_code IS 'QUOTE-SAFE. ISO-3166 alpha-2, uppercase. Never inferred from postal code.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.postal_code IS 'QUOTE-SAFE. Raw value, trimmed only.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.postal_code_normalized IS
  'QUOTE-SAFE. Deterministic: upper(regexp_replace(postal_code, ''[^A-Za-z0-9]'', '''', ''g'')). Matching aid only; NOT validation and NOT carrier deliverability (BOR-DEC-111).';
COMMENT ON COLUMN public.customer_delivery_destination_versions.city IS 'QUOTE-SAFE.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.region IS 'QUOTE-SAFE.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.destination_type IS 'QUOTE-SAFE. residential | business. Never inferred.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.floor_level IS 'QUOTE-SAFE. Nullable integer, -10..200. Does not imply elevator_access.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.elevator_access IS 'QUOTE-SAFE.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.lift_gate_requirement IS 'QUOTE-SAFE.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.delivery_appointment_requirement IS 'QUOTE-SAFE.';
COMMENT ON COLUMN public.customer_delivery_destination_versions.street_name IS 'RESTRICTED. Never exposed to sellers (BOR-DEC-108).';
COMMENT ON COLUMN public.customer_delivery_destination_versions.house_number IS 'RESTRICTED. Never exposed to sellers (BOR-DEC-108).';
COMMENT ON COLUMN public.customer_delivery_destination_versions.address_unit IS 'RESTRICTED. Never exposed to sellers (BOR-DEC-108).';

-- 3. Guards ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1eb_guard_destination_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.buyer_principal_id <> OLD.buyer_principal_id THEN
      RAISE EXCEPTION 'M1C-1E-B: destination identity is immutable';
    END IF;
    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
      RAISE EXCEPTION 'M1C-1E-B: retired destination cannot be reactivated';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1eb_guard_version_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  parent_status text;
  parent_buyer  uuid;
  prev          public.customer_delivery_destination_versions%ROWTYPE;
  active_count  integer;
BEGIN
  SELECT d.status, d.buyer_principal_id INTO parent_status, parent_buyer
  FROM public.customer_delivery_destinations d
  WHERE d.id = NEW.customer_delivery_destination_id;

  IF parent_buyer IS NULL THEN
    RAISE EXCEPTION 'M1C-1E-B: parent destination does not exist';
  END IF;
  IF parent_buyer <> NEW.buyer_principal_id THEN
    RAISE EXCEPTION 'M1C-1E-B: version buyer principal must match the parent destination buyer';
  END IF;

  IF NEW.supersedes_version_id IS NOT NULL THEN
    SELECT * INTO prev FROM public.customer_delivery_destination_versions v
    WHERE v.id = NEW.supersedes_version_id;
    IF prev.id IS NULL THEN
      RAISE EXCEPTION 'M1C-1E-B: superseded version does not exist';
    END IF;
    IF prev.customer_delivery_destination_id <> NEW.customer_delivery_destination_id THEN
      RAISE EXCEPTION 'M1C-1E-B: cannot supersede a version of another destination';
    END IF;
    IF prev.buyer_principal_id <> NEW.buyer_principal_id THEN
      RAISE EXCEPTION 'M1C-1E-B: cross-buyer supersession is forbidden';
    END IF;
    IF NEW.version_number <= prev.version_number THEN
      RAISE EXCEPTION 'M1C-1E-B: superseding version number must be higher';
    END IF;
  END IF;

  IF NEW.status = 'active' THEN
    IF parent_status <> 'active' THEN
      RAISE EXCEPTION 'M1C-1E-B: only an active destination may hold an active version';
    END IF;
    SELECT count(*) INTO active_count
    FROM public.customer_delivery_destination_versions v
    WHERE v.customer_delivery_destination_id = NEW.customer_delivery_destination_id
      AND v.status = 'active'
      AND v.id <> NEW.id;
    IF active_count > 0 THEN
      RAISE EXCEPTION 'M1C-1E-B: only one active version per destination is allowed';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1eb_guard_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.customer_delivery_destination_id <> OLD.customer_delivery_destination_id
       OR NEW.buyer_principal_id <> OLD.buyer_principal_id
       OR NEW.version_number <> OLD.version_number
       OR NEW.precision_level <> OLD.precision_level
       OR NEW.country_code <> OLD.country_code
       OR NEW.postal_code <> OLD.postal_code
       OR NEW.postal_code_normalized <> OLD.postal_code_normalized
       OR NEW.city <> OLD.city
       OR NEW.destination_type <> OLD.destination_type
       OR NEW.elevator_access <> OLD.elevator_access
       OR NEW.lift_gate_requirement <> OLD.lift_gate_requirement
       OR NEW.delivery_appointment_requirement <> OLD.delivery_appointment_requirement
       OR NEW.region IS DISTINCT FROM OLD.region
       OR NEW.street_name IS DISTINCT FROM OLD.street_name
       OR NEW.house_number IS DISTINCT FROM OLD.house_number
       OR NEW.address_unit IS DISTINCT FROM OLD.address_unit
       OR NEW.floor_level IS DISTINCT FROM OLD.floor_level
       OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
    THEN
      RAISE EXCEPTION 'M1C-1E-B: version % is immutable in status %; create a new version instead',
        OLD.id, OLD.status;
    END IF;
  END IF;

  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'M1C-1E-B: superseded versions are terminal';
  END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'M1C-1E-B: retired versions are terminal';
  END IF;
  IF OLD.status = 'active' AND NEW.status NOT IN ('active','superseded','retired') THEN
    RAISE EXCEPTION 'M1C-1E-B: invalid version status transition from active';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_m1c1eb_destination_touch
  BEFORE UPDATE ON public.customer_delivery_destinations
  FOR EACH ROW EXECUTE FUNCTION public.m1c1eb_guard_destination_touch();

CREATE TRIGGER trg_m1c1eb_version_immutability
  BEFORE UPDATE ON public.customer_delivery_destination_versions
  FOR EACH ROW EXECUTE FUNCTION public.m1c1eb_guard_version_immutability();

CREATE TRIGGER trg_m1c1eb_version_integrity
  BEFORE INSERT OR UPDATE ON public.customer_delivery_destination_versions
  FOR EACH ROW EXECUTE FUNCTION public.m1c1eb_guard_version_integrity();

-- 4. RLS: enabled + forced, zero policies ---------------------------------
ALTER TABLE public.customer_delivery_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_delivery_destinations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_delivery_destination_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_delivery_destination_versions FORCE ROW LEVEL SECURITY;

-- 5. ACL normalization: owner-only, zero grants ---------------------------
DO $$
DECLARE
  rl        text;
  app_roles text[] := array['anon','authenticated','service_role','sandbox_exec'];
  fn        text;
  fns       text[] := array[
    'public.m1c1eb_guard_destination_touch()',
    'public.m1c1eb_guard_version_integrity()',
    'public.m1c1eb_guard_version_immutability()'
  ];
BEGIN
  REVOKE ALL ON TABLE public.customer_delivery_destinations FROM PUBLIC;
  REVOKE ALL ON TABLE public.customer_delivery_destination_versions FROM PUBLIC;
  FOREACH rl IN ARRAY app_roles LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.customer_delivery_destinations FROM %I', rl);
    EXECUTE format('REVOKE ALL ON TABLE public.customer_delivery_destination_versions FROM %I', rl);
  END LOOP;

  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    FOREACH rl IN ARRAY app_roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', fn, rl);
    END LOOP;
  END LOOP;
END $$;

-- 6. Fail-closed post-conditions ------------------------------------------
DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('customer_delivery_destinations','customer_delivery_destination_versions')
    AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v <> 2 THEN RAISE EXCEPTION 'M1C-1E-B: RLS not enabled+forced (%).', v; END IF;

  SELECT count(*) INTO v FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('customer_delivery_destinations','customer_delivery_destination_versions');
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: policies present (%).', v; END IF;

  SELECT count(*) INTO v
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
       LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
  WHERE n.nspname='public'
    AND c.relname IN ('customer_delivery_destinations','customer_delivery_destination_versions')
    AND has_table_privilege(rl.r, c.oid, pv.p);
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: destination tables still reachable (%).', v; END IF;

  SELECT count(*) INTO v
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
  WHERE n.nspname='public' AND p.proname LIKE 'm1c1eb_guard_%'
    AND (p.proacl IS NULL OR has_function_privilege(rl.r, p.oid, 'EXECUTE'));
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: guard routines reachable or proacl NULL (%).', v; END IF;

  SELECT count(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='S' AND c.relname LIKE '%delivery_destination%';
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: unexpected sequences (%).', v; END IF;

  SELECT count(*) INTO v FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name IN ('customer_delivery_destinations','customer_delivery_destination_versions')
    AND (data_type = 'jsonb' OR column_name IN ('email','phone','recipient_name','delivery_notes','latitude','longitude'));
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: forbidden column present (%).', v; END IF;

  SELECT count(*) INTO v FROM public.customer_delivery_destinations;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: destinations must be empty (%).', v; END IF;
  SELECT count(*) INTO v FROM public.customer_delivery_destination_versions;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1E-B: versions must be empty (%).', v; END IF;
END $$;