-- Disposable hardening proof only; never replay into Mercur/Supabase production.
CREATE TABLE principals(id text PRIMARY KEY, tenant text NOT NULL, active boolean NOT NULL DEFAULT true, kind text NOT NULL CHECK(kind IN ('buyer','seller')));
CREATE TABLE orders(id text PRIMARY KEY,tenant text NOT NULL,buyer_id text NOT NULL REFERENCES principals(id),amount bigint NOT NULL CHECK(amount>0),currency text NOT NULL CHECK(currency='EUR'),state text NOT NULL DEFAULT 'UNPAID',UNIQUE(id,tenant));
CREATE TABLE operations(id uuid PRIMARY KEY,tenant text NOT NULL,order_id text NOT NULL,buyer_id text NOT NULL,request_key text NOT NULL,provider_key text UNIQUE NOT NULL,payload_hash text NOT NULL,amount bigint NOT NULL,currency text NOT NULL,status text NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','RECONCILE','PAID','DECLINED','QUARANTINED','BLOCKED')),lease_token uuid,lease_until timestamptz,provider_ref text,attempts integer NOT NULL DEFAULT 0,last_error text,UNIQUE(tenant,buyer_id,request_key),UNIQUE(order_id),FOREIGN KEY(order_id,tenant) REFERENCES orders(id,tenant));
CREATE TABLE operation_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,operation_id uuid NOT NULL REFERENCES operations(id),tenant text NOT NULL,event text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE inbox(event_id text PRIMARY KEY,operation_id uuid NOT NULL REFERENCES operations(id),tenant text NOT NULL,body_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_EVENT'; END $$;
CREATE TRIGGER event_no_rewrite BEFORE UPDATE OR DELETE ON operation_events FOR EACH ROW EXECUTE FUNCTION immutable_event();
CREATE FUNCTION immutable_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.id,NEW.tenant,NEW.order_id,NEW.buyer_id,NEW.provider_key,NEW.payload_hash,NEW.amount,NEW.currency,NEW.request_key) IS DISTINCT FROM (OLD.id,OLD.tenant,OLD.order_id,OLD.buyer_id,OLD.provider_key,OLD.payload_hash,OLD.amount,OLD.currency,OLD.request_key) THEN RAISE EXCEPTION 'IMMUTABLE_INTENT'; END IF; RETURN NEW; END $$;
CREATE TRIGGER intent_no_rewrite BEFORE UPDATE ON operations FOR EACH ROW EXECUTE FUNCTION immutable_intent();
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY buyer_orders ON orders TO surooh_api USING(tenant=current_setting('surooh.tenant',true) AND buyer_id=current_setting('surooh.buyer',true));
CREATE POLICY buyer_operations ON operations TO surooh_api USING(tenant=current_setting('surooh.tenant',true) AND buyer_id=current_setting('surooh.buyer',true));
CREATE POLICY buyer_events ON operation_events TO surooh_api USING(tenant=current_setting('surooh.tenant',true) AND EXISTS(SELECT 1 FROM operations o WHERE o.id=operation_id));
GRANT USAGE ON SCHEMA public TO surooh_api,surooh_worker;
GRANT SELECT ON orders,operations,operation_events TO surooh_api;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO surooh_worker;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO surooh_worker;
-- Worker has narrowly-scoped maintenance of this dedicated service schema, not a browser credential.
CREATE POLICY worker_orders ON orders TO surooh_worker USING(true) WITH CHECK(true);
CREATE POLICY worker_ops ON operations TO surooh_worker USING(true) WITH CHECK(true);
CREATE POLICY worker_events ON operation_events TO surooh_worker USING(true) WITH CHECK(true);
CREATE FUNCTION queue_intent(p_id uuid,p_order text,p_key text,p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; x public.operations; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant=current_setting('surooh.tenant',true) AND buyer_id=current_setting('surooh.buyer',true) FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.principals p WHERE p.id=o.buyer_id AND p.active AND p.kind='buyer') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO x FROM public.operations WHERE tenant=o.tenant AND buyer_id=o.buyer_id AND request_key=p_key;
 IF FOUND THEN IF x.order_id<>o.id OR x.payload_hash<>p_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN x.id; END IF;
 INSERT INTO public.operations(id,tenant,order_id,buyer_id,request_key,provider_key,payload_hash,amount,currency) VALUES(p_id,o.tenant,o.id,o.buyer_id,p_key,'borvat:'||p_id::text,p_hash,o.amount,o.currency);
 INSERT INTO public.operation_events(operation_id,tenant,event) VALUES(p_id,o.tenant,'INTENT_COMMITTED');
 RETURN p_id;
 END $$;
REVOKE ALL ON FUNCTION queue_intent(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION queue_intent(uuid,text,text,text) TO surooh_api;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
