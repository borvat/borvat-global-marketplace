-- BORVAT synthetic multi-vendor foundation: PostgreSQL 16 / isolated Neon TEST only.
-- Never apply to the legacy Lovable Cloud database or any production database.
-- Application DB role MUST NOT own these tables or have BYPASSRLS.
BEGIN;
CREATE SCHEMA IF NOT EXISTS borvat;
CREATE TABLE IF NOT EXISTS borvat.sellers (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS borvat.memberships (
  user_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES borvat.sellers(id),
  role text NOT NULL CHECK(role IN ('seller_admin','seller_staff')),
  PRIMARY KEY(user_id,seller_id)
);
CREATE TABLE IF NOT EXISTS borvat.products (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','rejected'))
);
CREATE TABLE IF NOT EXISTS borvat.offers (
  id uuid PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES borvat.sellers(id),
  product_id uuid NOT NULL REFERENCES borvat.products(id),
  market char(2) NOT NULL,
  currency char(3) NOT NULL,
  price_minor bigint NOT NULL CHECK(price_minor >= 0),
  stock integer NOT NULL CHECK(stock >= 0),
  status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','published','held','rejected')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_seller_idx ON borvat.offers(seller_id);
CREATE TABLE IF NOT EXISTS borvat.ad_campaigns (
  id uuid PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES borvat.sellers(id),
  currency char(3) NOT NULL,
  budget_minor bigint NOT NULL CHECK(budget_minor >= 0),
  spent_minor bigint NOT NULL DEFAULT 0 CHECK(spent_minor >= 0 AND spent_minor <= budget_minor),
  status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','paused','rejected')),
  CHECK (budget_minor >= spent_minor)
);
CREATE TABLE IF NOT EXISTS borvat.risk_cases (
  id uuid PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES borvat.offers(id),
  state text NOT NULL CHECK(state IN ('open','held','cleared','rejected')),
  reason_code text NOT NULL,
  opened_by uuid NOT NULL,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(resolved_by IS NULL OR resolved_by <> opened_by)
);
CREATE TABLE IF NOT EXISTS borvat.buyer_orders (
  id uuid PRIMARY KEY,
  buyer_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  currency char(3) NOT NULL,
  total_minor bigint NOT NULL CHECK(total_minor >= 0),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','test_confirmed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS borvat.seller_orders (
  id uuid PRIMARY KEY,
  buyer_order_id uuid NOT NULL REFERENCES borvat.buyer_orders(id),
  seller_id uuid NOT NULL REFERENCES borvat.sellers(id),
  state text NOT NULL DEFAULT 'created' CHECK(state IN ('created','processing','fulfilled','cancelled','partially_refunded','refunded')),
  amount_minor bigint NOT NULL CHECK(amount_minor >= 0),
  UNIQUE (buyer_order_id,seller_id)
);
CREATE INDEX IF NOT EXISTS seller_orders_seller_idx ON borvat.seller_orders(seller_id);
CREATE TABLE IF NOT EXISTS borvat.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- Defense in depth only; authority must first be verified by authenticated service.
-- SET borvat.actor_id / borvat.seller_id must NEVER be accepted from a client request.
CREATE FUNCTION borvat.session_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('borvat.actor_id',true),'')::uuid
$$;
CREATE FUNCTION borvat.is_seller_member(target_seller uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT EXISTS(SELECT 1 FROM borvat.memberships m WHERE m.seller_id=target_seller AND m.user_id=borvat.session_user_id())
$$;
ALTER TABLE borvat.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.seller_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.buyer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.sellers FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.offers FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.ad_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.seller_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.buyer_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.risk_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY seller_read_own ON borvat.sellers FOR SELECT USING (borvat.is_seller_member(id));
CREATE POLICY memberships_read_own ON borvat.memberships FOR SELECT USING (user_id=borvat.session_user_id());
CREATE POLICY offers_read_own ON borvat.offers FOR SELECT USING (borvat.is_seller_member(seller_id));
CREATE POLICY campaigns_read_own ON borvat.ad_campaigns FOR SELECT USING (borvat.is_seller_member(seller_id));
CREATE POLICY orders_read_own ON borvat.seller_orders FOR SELECT USING (borvat.is_seller_member(seller_id));
CREATE POLICY buyer_orders_read_own ON borvat.buyer_orders FOR SELECT USING (buyer_id=borvat.session_user_id());
-- No general user write policies. Writes only through a separately permissioned server-side
-- workflow/transaction; public product discovery via a narrow vetted API, not direct SQL.
COMMIT;
