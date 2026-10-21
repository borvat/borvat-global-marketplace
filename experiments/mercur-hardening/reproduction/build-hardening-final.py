import os,subprocess,pathlib,http.server,threading
root=pathlib.Path(__file__).resolve().parent;app=root/'mercur'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(app/'packages/cli'),**kw)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
env=os.environ.copy();env['PATH']='/root/.npm/_npx/f87303d941e257a6/node_modules/.bin:'+env['PATH'];env['MERCUR_ROUTES_MANIFEST_URL']=f'http://127.0.0.1:{server.server_port}/routes-manifest.json';env['MEDUSA_TELEMETRY_DISABLED']='true'
try:
 with open(root/'hardening/mercur-build-final.log','w') as f:r=subprocess.run(['bun','run','build','--filter=@mercurjs/core...','--env-mode=loose','--force'],cwd=app,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=600)
 print('build exit',r.returncode);raise SystemExit(r.returncode)
finally:server.shutdown()
