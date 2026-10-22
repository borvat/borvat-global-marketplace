import os,subprocess,pathlib,time,json,sys
root=pathlib.Path(os.environ.get('BORVAT_LAB_ROOT',str(pathlib.Path(__file__).resolve().parent)))
infra=root/'infra'; app=root/'mercur'; out=root/'resolution/native';out.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
for k in list(env):
 if k.startswith(('SUPABASE_','STRIPE_','SMTP_','MEDUSA_FF_')) or k in ['DATABASE_URL','REDIS_URL']:env.pop(k,None)
env.update({'DB_HOST':'localhost','DB_PORT':'5432','DB_USERNAME':'postgres','DB_PASSWORD':'synthetic','DATABASE_URL':'postgresql://postgres:synthetic@localhost:5432/mercur','NODE_ENV':'test','TEST_TYPE':'integration:http','MEDUSA_FF_SELLER_REGISTRATION':'true','MEDUSA_FF_PRODUCT_REQUEST':'false','MEDUSA_FF_RBAC':'false','MEDUSA_FF_RBAC_FILTER_FIELDS':'false','JWT_SECRET':'synthetic-isolated-evaluation-only','COOKIE_SECRET':'synthetic-isolated-evaluation-only','MEDUSA_TELEMETRY_DISABLED':'true','NODE_OPTIONS':'--experimental-vm-modules --dns-result-order=ipv4first --max-old-space-size=6144 --import='+str(pathlib.Path(os.environ.get('BORVAT_FOUNDATION_ROOT',str(root.parent/'marketplace-foundation')))/'scripts/foundation/no-external-network.mjs')})
env['MEDUSA_DISABLE_TELEMETRY']='true';env['TURBO_TELEMETRY_DISABLED']='1';env['DO_NOT_TRACK']='1'
env['PGCONNECT_TIMEOUT']='5'
pg_env=env.copy();pg_env.pop('NODE_OPTIONS',None);pg_env['LD_PRELOAD']=str(infra/'uid-test.so')
pgdata=infra/('pgdata-resolution-native-'+__import__('uuid').uuid4().hex)
if not pgdata.exists():
 with open(out/'initdb.log','w') as f:subprocess.run([str(infra/'node_modules/@embedded-postgres/linux-x64/native/bin/initdb'),'-D',str(pgdata),'-U','postgres','-A','trust','--no-locale','--encoding=UTF8'],env=pg_env,stdout=f,stderr=subprocess.STDOUT,check=True)
with open(out/'postgres.log','w') as log:
 pg=subprocess.Popen([str(infra/'node_modules/@embedded-postgres/linux-x64/native/bin/postgres'),'-D',str(pgdata),'-h','127.0.0.1','-p','5432','-k',''],env=pg_env,stdout=log,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   if pg.poll() is not None:raise RuntimeError('Local PostgreSQL exited: '+(out/'postgres.log').read_text())
   if 'ready to accept connections' in (out/'postgres.log').read_text():break
   time.sleep(.1)
  probe=subprocess.run(['node','-e',"const {Client}=require('pg');const c=new Client({host:'127.0.0.1',port:5432,user:'postgres',database:'postgres'});c.connect().then(()=>c.query('select version()')).then(r=>console.log(r.rows)).finally(()=>c.end());"],cwd=infra,env=env,capture_output=True,text=True,timeout=15)
  (out/'pg-connect.txt').write_text(probe.stdout+probe.stderr);assert probe.returncode==0
  cases=['http/borvat/hardening.spec.ts','http/payment/split-order-payments.spec.ts','http/borvat/payout-durability-gap.spec.ts']
  if os.environ.get('SMOKE_ONLY'):cases=cases[:1]
  cmd=['node',str(app/'integration-tests/node_modules/jest/bin/jest.js'),'--runInBand','--forceExit','--json','--outputFile='+str(out/'results.json'),'--runTestsByPath',*cases]
  (out/'command.json').write_text(json.dumps({'command':cmd,'env':{k:env[k] for k in ['DB_HOST','DB_PORT','DB_USERNAME','DATABASE_URL','MEDUSA_FF_RBAC','MEDUSA_FF_RBAC_FILTER_FIELDS','NODE_OPTIONS']},'cases':cases},indent=2))
  with open(out/'test.log','w') as f:r=subprocess.run(cmd,cwd=app/'integration-tests',env=env,stdout=f,stderr=subprocess.STDOUT,timeout=900)
  (out/'exit.json').write_text(json.dumps({'exit_code':r.returncode}));sys.exit(r.returncode)
 finally:
  pg.terminate()
  try:pg.wait(timeout=15)
  except subprocess.TimeoutExpired:pg.kill();pg.wait()
