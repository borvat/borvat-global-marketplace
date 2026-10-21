-- TEST ONLY. Apply after 001, 002 and 003 to an ISOLATED PostgreSQL database.
-- This is a new, append-only quote snapshot. It does not modify production schemas.
BEGIN;
CREATE TABLE IF NOT EXISTS borvat.order_quote_snapshots (
 buyer_order_id uuid PRIMARY KEY REFERENCES borvat.buyer_orders(id) ON DELETE RESTRICT,
 schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
 currency char(3) NOT NULL CHECK (currency = 'EUR'),
 gross_minor bigint NOT NULL CHECK (gross_minor >= 0),
 net_minor bigint NOT NULL CHECK (net_minor >= 0),
 vat_minor bigint NOT NULL CHECK (vat_minor >= 0),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
 snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (net_minor + vat_minor = gross_minor)
);
CREATE OR REPLACE FUNCTION borvat.reject_quote_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'order quote snapshots are append-only' USING ERRCODE='23514';
END;
$$;
DROP TRIGGER IF EXISTS order_quote_snapshots_immutable ON borvat.order_quote_snapshots;
CREATE TRIGGER order_quote_snapshots_immutable
BEFORE UPDATE OR DELETE ON borvat.order_quote_snapshots
FOR EACH ROW EXECUTE FUNCTION borvat.reject_quote_snapshot_mutation();
ALTER TABLE borvat.order_quote_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE borvat.order_quote_snapshots FORCE ROW LEVEL SECURITY;
-- Owner can read historical prices, but untrusted clients cannot write.
CREATE POLICY quote_snapshot_buyer_read ON borvat.order_quote_snapshots
FOR SELECT USING (
 EXISTS (SELECT 1 FROM borvat.buyer_orders bo WHERE bo.id=buyer_order_id
  AND bo.buyer_id=borvat.session_user_id())
);
COMMIT;
