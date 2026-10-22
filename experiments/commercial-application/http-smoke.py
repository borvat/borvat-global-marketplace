#!/usr/bin/env python3
"""Start/check/stop an owned loopback Vite process in the same runtime."""
from pathlib import Path
import hashlib,json,os,subprocess,time,urllib.request
lab=Path(__file__).resolve().parent;repo=lab.parents[1];out=repo/'docs/commercial-application/evidence'
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','SYSTEMROOT']};env['NODE_OPTIONS']='--import='+str(repo/'scripts/foundation/no-external-network.mjs')
argv=['node','node_modules/vite/bin/vite.js','--config','vite.config.mjs','--port','4181']
with (out/'local-http-server.log').open('w') as log:
 process=subprocess.Popen(argv,cwd=lab,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  response=None
  for _ in range(30):
   if process.poll() is not None:raise RuntimeError('Owned preview server exited before ready')
   try:response=urllib.request.urlopen('http://127.0.0.1:4181/',timeout=1);break
   except OSError:time.sleep(0.1)
  if response is None:raise RuntimeError('Loopback readiness unavailable')
  body=response.read();assert response.status==200 and b'main.tsx' in body
  main=urllib.request.urlopen('http://127.0.0.1:4181/main.tsx',timeout=5);script=main.read();assert main.status==200 and b'CommercialWorkspace' in script
  (out/'local-http.json').write_text(json.dumps({'status':'PASS','argv':argv,'requests':[{'path':'/','status':response.status,'sha256':hashlib.sha256(body).hexdigest()},{'path':'/main.tsx','status':main.status,'sha256':hashlib.sha256(script).hexdigest()}],'scope':'Local HTTP HTML/module smoke only; no browser rendering/hydration/click certification'},indent=2)+'\n')
  print('PASS: local HTML and transformed entry HTTP200; not browser E2E')
 finally:
  process.terminate()
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:process.kill();process.wait()
