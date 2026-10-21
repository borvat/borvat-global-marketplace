-- M1B-1: Borvat Direct Publication State Foundation
-- Separate one-to-one entity, isolated from channel_listings lifecycle.

CREATE TABLE public.borvat_direct_listing_publications (
  channel_listing_id uuid PRIMARY KEY
    REFERENCES public.channel_listings(id) ON DELETE CASCADE,
  publication_status text NOT NULL DEFAULT 'not_ready',
  first_published_at timestamptz NULL,
  last_published_at timestamptz NULL,
  last_unpublished_at timestamptz NULL,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT borvat_direct_publication_status_chk
    CHECK (publication_status IN ('not_ready','ready','published','paused','withdrawn'))
);

COMMENT ON TABLE public.borvat_direct_listing_publications IS
  'M1B-1 Publication state for Borvat Direct listings. Separated from channel_listings.status/control_state. published/ready/paused/withdrawn are declared but NOT reachable in this phase — no publish workflow exists yet.';

-- Grants: no direct DML for anon/authenticated/service_role. SELECT via RLS only.
REVOKE ALL ON public.borvat_direct_listing_publications FROM PUBLIC;
GRANT SELECT ON public.borvat_direct_listing_publications TO authenticated;

-- Provider gate: only borvat_direct channel accounts may have publication rows.
CREATE OR REPLACE FUNCTION public._borvat_direct_publication_provider_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_provider text;
  v_company_id uuid;
BEGIN
  SELECT ca.provider, cl.company_id
    INTO v_provider, v_company_id
  FROM public.channel_listings cl
  JOIN public.channel_accounts ca ON ca.id = cl.channel_account_id
  WHERE cl.id = NEW.channel_listing_id;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'channel listing % not found', NEW.channel_listing_id
      USING ERRCODE = '23503';
  END IF;

  IF v_provider <> 'borvat_direct' THEN
    RAISE EXCEPTION 'publication rows only allowed for borvat_direct listings (got %)', v_provider
      USING ERRCODE = '23514';
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'channel listing % has no company', NEW.channel_listing_id
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.publication_status <> 'not_ready' THEN
    RAISE EXCEPTION 'new publication rows must start in not_ready'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public._borvat_direct_publication_provider_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER borvat_direct_publication_provider_guard
BEFORE INSERT OR UPDATE OF channel_listing_id ON public.borvat_direct_listing_publications
FOR EACH ROW EXECUTE FUNCTION public._borvat_direct_publication_provider_guard();

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public._borvat_direct_publication_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public._borvat_direct_publication_touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER borvat_direct_publication_touch_updated_at
BEFORE UPDATE ON public.borvat_direct_listing_publications
FOR EACH ROW EXECUTE FUNCTION public._borvat_direct_publication_touch_updated_at();

-- RLS
ALTER TABLE public.borvat_direct_listing_publications ENABLE ROW LEVEL SECURITY;

-- Seller read: must be active member of owning company with listings.read permission
CREATE POLICY "borvat_direct_publications_seller_read"
ON public.borvat_direct_listing_publications
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.channel_listings cl
    WHERE cl.id = borvat_direct_listing_publications.channel_listing_id
      AND public.company_member_has_permission(cl.company_id, auth.uid(), 'listings.read')
  )
);

-- Platform admin read: cross-tenant read-only
CREATE POLICY "borvat_direct_publications_admin_read"
ON public.borvat_direct_listing_publications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies: fail-closed for all client roles.

CREATE INDEX borvat_direct_publications_status_idx
  ON public.borvat_direct_listing_publications (publication_status, status_changed_at DESC);