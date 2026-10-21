import pg from 'pg';
import {randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function localPool(url){const u=new URL(url);if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.startsWith('/borvat_hardening_'))throw Error('NON_DISPOSABLE_DATABASE_DENIED');return new pg.Pool({connectionString:url,max:8});}
export async function tx(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function asBuyer(pool,p,fn){if(p.role!=='buyer')throw Error('FORBIDDEN_ACTOR');return tx(pool,async c=>{await c.query("SELECT set_config('surooh.tenant',$1,true),set_config('surooh.buyer',$2,true)",[p.tenant,p.id]);return fn(c);});}
export async function queue(pool,p,order,key){if(!/^[a-zA-Z0-9_-]{8,120}$/.test(key))throw Error('BAD_KEY');return asBuyer(pool,p,async c=>{const rows=await c.query('SELECT * FROM orders WHERE id=$1',[order]);if(!rows.rows[0])throw Error('FORBIDDEN_ORDER');const o=rows.rows[0];const payloadHash=hash([o.tenant,o.id,o.buyer_id,o.amount,o.currency]);const r=await c.query('SELECT queue_intent($1,$2,$3,$4) id',[randomUUID(),order,key,payloadHash]);return r.rows[0].id;});}
export class SyntheticProvider {
 constructor(pool){this.pool=pool;this.lookupUnavailable=false;this.captureResponseLost=false;}
 async lookup(key){if(this.lookupUnavailable)throw Error('PROVIDER_UNAVAILABLE');return (await this.pool.query('SELECT * FROM captures WHERE key=$1',[key])).rows[0];}
 async capture(key,p){const r=await tx(this.pool,async c=>{await c.query('INSERT INTO captures(key,tenant,amount,currency,ref) VALUES($1,$2,$3,$4,$5) ON CONFLICT(key) DO NOTHING',[key,p.tenant,p.amount,p.currency,'syn_'+randomUUID()]);const f=(await c.query('SELECT * FROM captures WHERE key=$1',[key])).rows[0];if(f.tenant!==p.tenant||f.amount!==p.amount||f.currency!==p.currency)throw Error('PROVIDER_KEY_CONFLICT');return f;});if(this.captureResponseLost)throw Error('RESPONSE_LOST_AFTER_PROVIDER_COMMIT');return r;}
}
export async function workOne(pool,provider,{tenant,crashAfterProvider=false,failFinalize=false}={}){
 const lease=randomUUID();const op=await tx(pool,async c=>{
  const r=await c.query("SELECT * FROM operations WHERE tenant=$1 AND status IN ('READY','RECONCILE') AND (lease_until IS NULL OR lease_until<now()) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1",[tenant]);if(!r.rows[0])return null;
  const o=r.rows[0];const principal=(await c.query('SELECT active,kind FROM principals WHERE id=$1',[o.buyer_id])).rows[0];
  if(!principal?.active||principal.kind!=='buyer'){await c.query("UPDATE operations SET status='BLOCKED' WHERE id=$1",[o.id]);await c.query("INSERT INTO operation_events(operation_id,tenant,event) VALUES($1,$2,'AUTHORIZATION_REVOKED')",[o.id,o.tenant]);return null;}
  await c.query("UPDATE operations SET status='RECONCILE',lease_token=$2,lease_until=now()+interval '30 seconds',attempts=attempts+1 WHERE id=$1",[o.id,lease]);
  await c.query("INSERT INTO operation_events(operation_id,tenant,event) VALUES($1,$2,'DISPATCH_LEASED')",[o.id,o.tenant]);return o;
 });if(!op)return {status:'IDLE'};
 try {
  // No SQL transaction remains open during provider calls. Always reconcile before retry.
  let fact=await provider.lookup(op.provider_key);
  if(!fact){if(op.status==='RECONCILE')return await retain('UNKNOWN_EFFECT_REQUIRES_REVIEW');fact=await provider.capture(op.provider_key,op);}
  if(crashAfterProvider)process.kill(process.pid,'SIGKILL');
  if(fact.tenant!==op.tenant||fact.amount!==op.amount||fact.currency!==op.currency){await pool.query("UPDATE operations SET status='QUARANTINED',last_error='FACT_MISMATCH',lease_until=NULL WHERE id=$1 AND lease_token=$2",[op.id,lease]);return {status:'QUARANTINED'};}
  await tx(pool,async c=>{const r=await c.query("UPDATE operations SET status='PAID',provider_ref=$3,lease_until=NULL WHERE id=$1 AND lease_token=$2 RETURNING id",[op.id,lease,fact.ref]);if(!r.rowCount)throw Error('STALE_LEASE');
   if(failFinalize)throw Error('SYNTHETIC_SQL_FAILURE_AFTER_CAPTURE');
   await c.query("UPDATE orders SET state='PAID' WHERE id=$1 AND tenant=$2",[op.order_id,op.tenant]);
   await c.query("INSERT INTO operation_events(operation_id,tenant,event,detail) VALUES($1,$2,'PROVIDER_CONFIRMED',$3)",[op.id,op.tenant,JSON.stringify({provider_ref:fact.ref})]);
  });return {status:'PAID',id:op.id};
 }catch(e){return retain(e.message);}
 async function retain(reason){await tx(pool,async c=>{const r=await c.query("UPDATE operations SET status='RECONCILE',lease_until=NULL,last_error=$3 WHERE id=$1 AND lease_token=$2 AND status NOT IN ('PAID','QUARANTINED') RETURNING id",[op.id,lease,reason]);if(r.rowCount)await c.query("INSERT INTO operation_events(operation_id,tenant,event,detail) VALUES($1,$2,'RECONCILIATION_REQUIRED',$3)",[op.id,op.tenant,JSON.stringify({reason})]);});return {status:'RECONCILE',id:op.id,reason};}
}
export function signWebhook(secret,body){return createHmac('sha256',secret).update(body).digest('hex');}
export async function webhook(pool,secret,raw,signature){const want=Buffer.from(signWebhook(secret,raw),'hex');const got=Buffer.from(signature??'','hex');if(got.length!==want.length||!timingSafeEqual(got,want))throw Error('BAD_SIGNATURE');const b=JSON.parse(raw);if(!b.event_id||!b.operation_id||!b.tenant||b.test_mode!==true)throw Error('BAD_EVENT');if(!Number.isFinite(b.sent_at)||Math.abs(Date.now()-b.sent_at)>300000)throw Error('EXPIRED_EVENT');return tx(pool,async c=>{const op=(await c.query('SELECT id FROM operations WHERE id=$1 AND tenant=$2',[b.operation_id,b.tenant])).rows[0];if(!op)throw Error('FOREIGN_EVENT');const digest=hash(b);const old=(await c.query('SELECT body_hash FROM inbox WHERE event_id=$1',[b.event_id])).rows[0];if(old){if(old.body_hash!==digest)throw Error('EVENT_ID_CONFLICT');return 'DUPLICATE';}const added=await c.query('INSERT INTO inbox(event_id,operation_id,tenant,body_hash) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',[b.event_id,b.operation_id,b.tenant,digest]);if(!added.rowCount){const same=(await c.query('SELECT body_hash FROM inbox WHERE event_id=$1',[b.event_id])).rows[0];if(same.body_hash!==digest)throw Error('EVENT_ID_CONFLICT');return 'DUPLICATE';}await c.query("INSERT INTO operation_events(operation_id,tenant,event) VALUES($1,$2,'WEBHOOK_HINT')",[b.operation_id,b.tenant]);return 'QUEUED_HINT';});}
