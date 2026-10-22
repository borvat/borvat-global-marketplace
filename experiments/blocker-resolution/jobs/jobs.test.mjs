import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from '../../mercur-hardening/node_modules/pg/lib/index.js';
const pools=Object.fromEntries(['ADMIN','API','WORKER'].map(k=>{
 const url=new URL(process.env[`TEST_${k}_DATABASE_URL`]);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/borvat_hardening_'))throw Error('LOCAL_DISPOSABLE_ONLY');
 return[k,new pg.Pool({connectionString:url.href,max:20})];
}));
await pools.ADMIN.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
after(async()=>{await pools.ADMIN.query('DROP SCHEMA job_proof CASCADE');await Promise.all(Object.values(pools).map(p=>p.end()))});
beforeEach(async()=>{await pools.ADMIN.query("TRUNCATE job_proof.memberships,job_proof.sellers,job_proof.jobs,job_proof.audit;INSERT INTO job_proof.memberships VALUES('a','A','seller',true),('b','B','seller',true),('buyer','A','buyer',true);INSERT INTO job_proof.sellers VALUES('sa','A','Alpha'),('sb','B','Beta')")});
async function queue(actor='a',tenant='A',resource='sa',name='Renamed',key=randomUUID()){
 const c=await pools.API.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('surooh.actor',$1,true),set_config('surooh.tenant',$2,true)",[actor,tenant]);const r=await c.query('SELECT job_proof.queue($1,$2,$3,$4) id',[randomUUID(),resource,name,key]);await c.query('COMMIT');return r.rows[0].id}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
const run=()=>pools.WORKER.query('SELECT job_proof.run_one()');
const name=async(id)=> (await pools.ADMIN.query('SELECT name FROM job_proof.sellers WHERE id=$1',[id])).rows[0].name;
test('J01 own seller command executes once under contention',async()=>{await queue();await Promise.all(Array.from({length:16},run));assert.equal(await name('sa'),'Renamed');assert.equal((await pools.ADMIN.query('SELECT count(*)::int n FROM job_proof.audit')).rows[0].n,1)});
test('J02 foreign seller and forged tenant context rejected',async()=>{await assert.rejects(queue('a','A','sb'),/FORBIDDEN/);await assert.rejects(queue('a','B','sb'),/FORBIDDEN/);assert.equal(await name('sb'),'Beta')});
test('J03 buyer and unknown administrator payload cannot enqueue',async()=>{await assert.rejects(queue('buyer'),/FORBIDDEN/);await assert.rejects(queue('admin'),/FORBIDDEN/)});
test('J04 revoked membership after queue is rechecked by worker',async()=>{await queue();await pools.ADMIN.query("UPDATE job_proof.memberships SET active=false WHERE actor='a'");await run();assert.equal(await name('sa'),'Alpha');assert.equal((await pools.ADMIN.query('SELECT status FROM job_proof.jobs')).rows[0].status,'blocked')});
test('J05 foreign resource injected by privileged transport cannot cross tenant',async()=>{await queue();await pools.ADMIN.query("UPDATE job_proof.jobs SET resource='sb'");await run();assert.equal(await name('sb'),'Beta');assert.equal((await pools.ADMIN.query('SELECT status FROM job_proof.jobs')).rows[0].status,'blocked')});
test('J06 pooled API identity does not persist beyond transaction',async()=>{await queue();await assert.rejects(pools.API.query('SELECT job_proof.queue($1,$2,$3,$4)',[randomUUID(),'sa','Leak',randomUUID()]),/FORBIDDEN/)});
test('J07 worker and API cannot directly rewrite domain rows or audit',async()=>{for(const p of [pools.API,pools.WORKER])await assert.rejects(p.query("UPDATE job_proof.sellers SET name='BYPASS'"),/permission denied/);await assert.rejects(pools.API.query("INSERT INTO job_proof.jobs(id) VALUES($1)",[randomUUID()]),/permission denied/)});
test('J08 duplicate/conflicting command identity',async()=>{const key=randomUUID();const a=await queue('a','A','sa','Same',key);assert.equal(await queue('a','A','sa','Same',key),a);await assert.rejects(queue('a','A','sa','Different',key),/IDEMPOTENCY_CONFLICT/)});
test('J09 concurrent duplicate enqueue creates one command',async()=>{const key=randomUUID();const ids=await Promise.all(Array.from({length:12},()=>queue('a','A','sa','Same',key)));assert.equal(new Set(ids).size,1)});
test('J10 exception rollback leaves no partial domain effect',async()=>{await queue();await pools.ADMIN.query("CREATE FUNCTION job_proof.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_SQL_FAILURE';END $$;CREATE TRIGGER inject_failure BEFORE INSERT ON job_proof.audit FOR EACH ROW EXECUTE FUNCTION job_proof.fail_audit()");try{await assert.rejects(run(),/AUDIT_SQL_FAILURE/);assert.equal(await name('sa'),'Alpha');assert.equal((await pools.ADMIN.query('SELECT status FROM job_proof.jobs')).rows[0].status,'ready')}finally{await pools.ADMIN.query('DROP TRIGGER inject_failure ON job_proof.audit;DROP FUNCTION job_proof.fail_audit()')}await run();assert.equal(await name('sa'),'Renamed')});
