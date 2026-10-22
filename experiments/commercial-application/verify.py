#!/usr/bin/env python3
"""Bounded app verification. Uses existing local dependencies; never installs or deploys."""
from pathlib import Path
import hashlib,json,os,subprocess
lab=Path(__file__).resolve().parent
repo=lab.parents[1]
app=repo/'apps/marketplace'
out=repo/'docs/commercial-application/evidence'
out.mkdir(parents=True,exist_ok=True)
env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','SYSTEMROOT')}
env['NODE_OPTIONS']='--import='+str(repo/'scripts/foundation/no-external-network.mjs')
commands=[
 ('commercial-types',['node','node_modules/typescript/bin/tsc','--project','tsconfig.json','--noEmit'],lab,0),
 ('commercial-tests',['node','--import','tsx','--test','tests/commercial.test.tsx','tests/email-render.test.tsx'],lab,0),
 ('commercial-build',['node','node_modules/vite/bin/vite.js','build','--config','vite.config.mjs'],lab,0),
 ('commercial-lint',['node','apps/marketplace/node_modules/eslint/bin/eslint.js','--config','apps/marketplace/eslint.config.js','apps/marketplace/src/lib/commercial/demo-adapter.ts','apps/marketplace/src/components/commercial/workspace.tsx','experiments/commercial-application/main.tsx','experiments/commercial-application/tests/commercial.test.tsx','experiments/commercial-application/tests/email-render.test.tsx','-f','json'],repo,0),
 ('foundation-reference',['node','scripts/foundation/check.mjs'],repo,0),
 ('source-parity',['node','scripts/foundation/source-parity.mjs'],repo,0),
 ('c1-gate',['node','scripts/foundation/gate.mjs','C1'],repo,1),
]
results=[]
for name,argv,cwd,expected in commands:
 r=subprocess.run(argv,cwd=cwd,env=env,capture_output=True,text=True,timeout=120)
 log=out/(name+'.log');log.write_text(r.stdout+r.stderr)
 results.append({'name':name,'argv':argv,'cwd':str(cwd.relative_to(repo)), 'exit':r.returncode,'expected_exit':expected,'status':('HOLD' if name=='c1-gate' else 'PASS') if r.returncode==expected else 'FAIL','log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
(out/'commands.json').write_text(json.dumps({'base_commit':'7306cd9d9479a81b3443d8611e754450b9efd4a8','runtime':subprocess.check_output(['node','--version'],text=True).strip(),'commands':results},indent=2)+'\n')
print(json.dumps(results,indent=2))
raise SystemExit(0 if all(r['exit']==r['expected_exit'] for r in results) else 1)
