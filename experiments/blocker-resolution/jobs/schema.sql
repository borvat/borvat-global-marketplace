-- Disposable PostgreSQL worker boundary. No native Mercur job is silently replaced.
CREATE SCHEMA job_proof;
REVOKE ALL ON SCHEMA job_proof FROM PUBLIC;
CREATE TABLE job_proof.memberships(actor text, tenant text, role text NOT NULL, active boolean NOT NULL DEFAULT true, PRIMARY KEY(actor,tenant));
CREATE TABLE job_proof.sellers(id text PRIMARY KEY,tenant text NOT NULL,name text NOT NULL);
CREATE TABLE job_proof.jobs(id uuid PRIMARY KEY,tenant text NOT NULL,actor text NOT NULL,resource text NOT NULL,operation text NOT NULL CHECK(operation='seller.rename'),name text NOT NULL,key text NOT NULL,status text NOT NULL DEFAULT 'ready', UNIQUE(tenant,actor,key));
CREATE TABLE job_proof.audit(id uuid PRIMARY KEY,tenant text NOT NULL,actor text NOT NULL,resource text NOT NULL,status text NOT NULL);
CREATE FUNCTION job_proof.no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_AUDIT'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON job_proof.audit FOR EACH ROW EXECUTE FUNCTION job_proof.no_rewrite();
CREATE FUNCTION job_proof.queue(p_id uuid,p_resource text,p_name text,p_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,job_proof AS $$
DECLARE a text:=current_setting('surooh.actor',true);t text:=current_setting('surooh.tenant',true);j job_proof.jobs;BEGIN
 IF NOT EXISTS(SELECT 1 FROM job_proof.memberships WHERE actor=a AND tenant=t AND active AND role='seller') OR NOT EXISTS(SELECT 1 FROM job_proof.sellers WHERE id=p_resource AND tenant=t) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 SELECT * INTO j FROM job_proof.jobs WHERE tenant=t AND actor=a AND key=p_key;
 IF FOUND THEN IF (j.resource,j.name) IS DISTINCT FROM (p_resource,p_name) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN j.id;END IF;
 INSERT INTO job_proof.jobs VALUES(p_id,t,a,p_resource,'seller.rename',p_name,p_key,'ready') ON CONFLICT(tenant,actor,key) DO NOTHING;
 SELECT * INTO j FROM job_proof.jobs WHERE tenant=t AND actor=a AND key=p_key;
 IF (j.resource,j.name) IS DISTINCT FROM(p_resource,p_name) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN j.id;
END $$;
CREATE FUNCTION job_proof.run_one() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,job_proof AS $$
DECLARE j job_proof.jobs;m job_proof.memberships;ok boolean;BEGIN
 SELECT * INTO j FROM job_proof.jobs WHERE status='ready' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Hold membership lock until effect commits; revocation cannot race past this check.
 SELECT * INTO m FROM job_proof.memberships WHERE actor=j.actor AND tenant=j.tenant FOR SHARE;
 ok:=FOUND AND m.active AND m.role='seller';
 IF ok THEN UPDATE job_proof.sellers SET name=j.name WHERE id=j.resource AND tenant=j.tenant;ok:=FOUND;END IF;
 UPDATE job_proof.jobs SET status=CASE WHEN ok THEN 'done' ELSE 'blocked' END WHERE id=j.id;
 INSERT INTO job_proof.audit VALUES(j.id,j.tenant,j.actor,j.resource,CASE WHEN ok THEN 'done' ELSE 'blocked' END);
 RETURN j.id;
END $$;
REVOKE ALL ON FUNCTION job_proof.queue(uuid,text,text,text),job_proof.run_one(),job_proof.no_rewrite() FROM PUBLIC;
GRANT USAGE ON SCHEMA job_proof TO surooh_api,surooh_worker;
GRANT EXECUTE ON FUNCTION job_proof.queue(uuid,text,text,text) TO surooh_api;
GRANT EXECUTE ON FUNCTION job_proof.run_one() TO surooh_worker;
