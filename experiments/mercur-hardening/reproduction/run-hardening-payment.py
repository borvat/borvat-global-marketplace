import pathlib,os,subprocess,time,json,sys
root=pathlib.Path(__file__).resolve().parent;infra=root/'infra';app=root.parent/'marketplace-foundation/experiments/mercur-hardening';out=root/'hardening/payment';out.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
for k in list(env):
 if k.startswith(('SUPABASE_','STRIPE_','SMTP_')) or k in ['DATABASE_URL','ADMIN_DATABASE_URL','APP_DATABASE_URL','REDIS_URL']:env.pop(k,None)
for k,user,db in [('ADMIN','postgres','main'),('API','surooh_api','main'),('WORKER','surooh_worker','main'),('PROVIDER','synthetic_psp','psp')]:env['TEST_'+k+'_DATABASE_URL']=f'postgresql://{user}:synthetic@127.0.0.1:55435/borvat_hardening_{db}'
env['TEST_PG_BIN']=str(infra/'node_modules/@embedded-postgres/linux-x64/native/bin')
env['NODE_OPTIONS']='--import='+str(root.parent/'marketplace-foundation/scripts/foundation/no-external-network.mjs')
pg_env=env.copy();pg_env.pop('NODE_OPTIONS',None);pg_env['LD_PRELOAD']=str(infra/'uid-test.so');pgdata=infra/'pgdata-hardening-payment-final'
if not pgdata.exists():
 with open(out/'initdb.log','w') as f:subprocess.run([str(infra/'node_modules/@embedded-postgres/linux-x64/native/bin/initdb'),'-D',str(pgdata),'-U','postgres','-A','trust','--no-locale','--encoding=UTF8'],env=pg_env,stdout=f,stderr=subprocess.STDOUT,check=True)
with open(out/'postgres.log','w') as f:
 pg=subprocess.Popen([str(infra/'node_modules/@embedded-postgres/linux-x64/native/bin/postgres'),'-D',str(pgdata),'-h','127.0.0.1','-p','55435','-k',''],env=pg_env,stdout=f,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   if pg.poll() is not None:raise RuntimeError((out/'postgres.log').read_text())
   if 'ready to accept connections' in (out/'postgres.log').read_text():break
   time.sleep(.1)
  script="""const {Client}=require('pg'); const c=new Client({host:'127.0.0.1',port:55435,user:'postgres',database:'postgres'});(async()=>{await c.connect();for(const role of ['surooh_api','surooh_worker','synthetic_psp'])await c.query('CREATE ROLE '+role+\" LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS\");await c.query('CREATE DATABASE borvat_hardening_main');await c.query('CREATE DATABASE borvat_hardening_psp OWNER synthetic_psp');await c.query('REVOKE CONNECT ON DATABASE borvat_hardening_psp FROM PUBLIC');await c.query('GRANT CONNECT ON DATABASE borvat_hardening_psp TO synthetic_psp');await c.end()})().catch(e=>{console.error(e);process.exit(1)});"""
  subprocess.run(['node','-e',script],cwd=infra,env=env,check=True,timeout=20)
  with open(out/'test.tap','w') as log:r=subprocess.run(['node','--test','--test-concurrency=1','payment/durability.test.mjs'],cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  if r.returncode==0:
   with open(out/'restore.json','w') as log:restore=subprocess.run(['node','payment/restore-proof.mjs'],cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=90)
   assert restore.returncode==0, 'restore proof failed'
  (out/'exit.json').write_text(json.dumps({'exit_code':r.returncode,'postgres':'17.6','payment_provider':'isolated synthetic ledger in separate PostgreSQL database; no external PSP','test_command':'node --test --test-concurrency=1 payment/durability.test.mjs'}));sys.exit(r.returncode)
 finally:
  pg.terminate()
  try:pg.wait(timeout=15)
  except subprocess.TimeoutExpired:pg.kill();pg.wait()
