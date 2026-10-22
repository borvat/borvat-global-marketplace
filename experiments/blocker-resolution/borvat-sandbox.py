"""Create a new disposable copy; never mutate imported original source or credentials."""
import pathlib,sys,shutil,subprocess,json,os
foundation=pathlib.Path(__file__).resolve().parents[2]
source=foundation/'apps/marketplace';dest=pathlib.Path(sys.argv[1]).resolve()
if dest.exists() or source==dest or source in dest.parents:raise SystemExit('DESTINATION_MUST_BE_NEW_AND_OUTSIDE_ORIGINAL')
shutil.copytree(source,dest,ignore=shutil.ignore_patterns('.env','.env.*','node_modules','.git','dist','.output','.nitro','.tanstack'))
patch=foundation/'experiments/mercur-hardening/borvat/buyer-account-typecheck-candidate.patch'
subprocess.run(['patch','--batch','-p1','-i',str(patch)],cwd=dest,check=True)
if not (source/'node_modules').exists():raise SystemExit('ORIGINAL_PINNED_DEPENDENCIES_REQUIRED; no automatic installer')
(dest/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
env=os.environ.copy();env.update({'DO_NOT_TRACK':'1','TURBO_TELEMETRY_DISABLED':'1','MEDUSA_TELEMETRY_DISABLED':'true','NODE_OPTIONS':'--import='+str(foundation/'scripts/foundation/no-external-network.mjs')})
for k in list(env):
 if k.startswith(('SUPABASE_','STRIPE_','SMTP_')) or k in ['DATABASE_URL','REDIS_URL']:env.pop(k,None)
logs=dest.parent/(dest.name+'-evidence');logs.mkdir(exist_ok=False);results={}
for name,cmd in [('lint',['node','node_modules/eslint/bin/eslint.js','.','--fix','--format','json']),('typecheck',['node','node_modules/typescript/bin/tsc','--noEmit']),('build',['node','node_modules/vite/bin/vite.js','build'])]:
 p=subprocess.run(cmd,cwd=dest,env=env,capture_output=True,text=True,timeout=180)
 (logs/(name+'.stdout')).write_text(p.stdout);(logs/(name+'.stderr')).write_text(p.stderr);results[name]={'command':cmd,'exit':p.returncode}
 if name=='lint':
  j=json.loads(p.stdout);(logs/'lint-summary.json').write_text(json.dumps({'errors':sum(x['errorCount'] for x in j),'warnings':sum(x['warningCount'] for x in j)},indent=2))
(logs/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results));raise SystemExit(1 if any(x['exit'] for x in results.values()) else 0)
