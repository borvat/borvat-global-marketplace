import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
export async function nativeRestore(db:any){
 const {Pool}=require(process.env.BORVAT_TEST_PG_MODULE!);const bin=process.env.BORVAT_PG_CLIENT_BIN!,lib=process.env.BORVAT_PG_CLIENT_LIB!;
 if(process.env.BORVAT_NATIVE_SYNTHETIC_ONLY!=='1'||!bin||!lib)throw Error('ISOLATED_NATIVE_RESTORE_ONLY');
 const fact=(await db.raw('SELECT current_database() name,inet_server_addr()::text host')).rows[0];if(!fact.name.startsWith('medusa-')||fact.host.split('/')[0]!=='127.0.0.1')throw Error('DISPOSABLE_DATABASE_ONLY');
 const destination='borvat_native_restored';const dir=mkdtempSync(join(tmpdir(),'borvat-native-restore-'));const env={...process.env,LD_LIBRARY_PATH:lib,PGPASSWORD:'synthetic'};
 const client=new Pool({host:'127.0.0.1',port:5432,user:'postgres',password:'synthetic',database:destination});let restored=false;
 const trx=await db.transaction();
 try{
  await trx.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const snapshot=(await trx.raw('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
  const tables=(await trx.raw("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname !~ '^pg_' ORDER BY schemaname,tablename")).rows;
  execFileSync(join(bin,'pg_dump'),['--host=127.0.0.1','--port=5432','--username=postgres','--format=custom','--no-owner','--no-acl','--snapshot='+snapshot,'--file='+join(dir,'native.dump'),fact.name],{env,timeout:120000});
  await db.raw('CREATE DATABASE '+destination);restored=true;
  execFileSync(join(bin,'pg_restore'),['--host=127.0.0.1','--port=5432','--username=postgres','--no-owner','--no-acl','--exit-on-error','--dbname='+destination,join(dir,'native.dump')],{env,timeout:120000});
  const hash=(rows:any[])=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');const comparisons=[];
  for(const t of tables){const name='"'+t.schemaname.replaceAll('"','""')+'"."'+t.tablename.replaceAll('"','""')+'"';const sql=`SELECT to_jsonb(t)::text row FROM ${name} t ORDER BY to_jsonb(t)::text`;const a=(await trx.raw(sql)).rows,b=(await client.query(sql)).rows;if(hash(a)!==hash(b))throw Error('RESTORE_ROW_MISMATCH '+name);comparisons.push({table:name,rows:a.length,sha256:hash(a)})}
  const constraints="SELECT conname,contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname,contype,definition";
  if(hash((await trx.raw(constraints)).rows)!==hash((await client.query(constraints)).rows))throw Error('RESTORE_CONSTRAINT_MISMATCH');
  const upgrade=await client.connect();try{await upgrade.query('BEGIN');await upgrade.query('ALTER TABLE payment_collection ADD COLUMN failed_upgrade_probe integer');await upgrade.query('ALTER TABLE payment_collection ADD CONSTRAINT injected_upgrade_failure CHECK(amount<0)');throw Error('FAULT_DID_NOT_FIRE')}catch(e:any){await upgrade.query('ROLLBACK');if(e.code!=='23514')throw e}finally{upgrade.release()}
  if((await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='payment_collection' AND column_name='failed_upgrade_probe'")).rowCount)throw Error('FAILED_MIGRATION_DID_NOT_ROLL_BACK');
  await client.query('ALTER TABLE payment_collection ADD COLUMN surooh_upgrade_probe integer NOT NULL DEFAULT 1');await client.query('SELECT id FROM payment_collection');if((await client.query('SELECT surooh_upgrade_probe FROM payment_collection LIMIT 1')).rows[0].surooh_upgrade_probe!==1)throw Error('UPGRADE_READ_FAILED');await client.query('ALTER TABLE payment_collection DROP COLUMN surooh_upgrade_probe');
  const result={status:'PASS',engine:'PostgreSQL 17.6',scope:'Full native database custom-format dump/restore and additive schema migration/rejected migration rollback; not cross-version Medusa/PostgreSQL upgrade or PITR',tables:comparisons.length,total_rows:comparisons.reduce((n,x)=>n+x.rows,0),row_hashes:comparisons,constraints:'MATCH',failed_migration_rollback:'PASS',old_and_new_readers:'PASS',native_application_reboot_after_restore:'NOT_RUN'};
  writeFileSync(process.env.BORVAT_NATIVE_RESTORE_EVIDENCE!,JSON.stringify(result,null,2));return result;
 }finally{await trx.rollback();await client.end();if(restored)await db.raw('DROP DATABASE '+destination+' WITH (FORCE)');rmSync(dir,{recursive:true,force:true})}
}
