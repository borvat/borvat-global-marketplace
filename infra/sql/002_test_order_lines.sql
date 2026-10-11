-- TEST ONLY. Apply after 001 on an empty isolated PostgreSQL database.
BEGIN;
CREATE TABLE IF NOT EXISTS borvat.order_lines (
  id uuid PRIMARY KEY,
  seller_order_id uuid NOT NULL REFERENCES borvat.seller_orders(id),
  offer_id uuid NOT NULL REFERENCES borvat.offers(id),
  quantity integer NOT NULL CHECK(quantity > 0),
  price_minor bigint NOT NULL CHECK(price_minor >= 0),
  UNIQUE(seller_order_id,offer_id)
);
CREATE INDEX IF NOT EXISTS order_lines_offer_idx ON borvat.order_lines(offer_id);
CREATE TABLE IF NOT EXISTS borvat.outbox_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE borvat.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE borvat.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY order_lines_seller_read ON borvat.order_lines FOR SELECT USING (
 EXISTS (SELECT 1 FROM borvat.seller_orders so WHERE so.id=seller_order_id AND borvat.is_seller_member(so.seller_id))
);
-- No direct write policies for application roles. Trusted transaction worker only.
COMMIT;
