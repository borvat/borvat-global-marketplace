from pathlib import Path
import urllib.request,urllib.error,json,concurrent.futures,hashlib
m=json.loads(Path('../marketplace-foundation/docs/source-recovery/manifest.json').read_text());files=[x['source'] for x in m['records']if x['status']=='BINARY_NOT_RECOVERED'];dest=Path('closure/asset-candidates');dest.mkdir(exist_ok=True)
def fetch(path):
 relative=path.removeprefix('public/');url='https://borvatshop.com/'+relative;r={'source':path,'url':url}
 try:
  with urllib.request.urlopen(url,timeout=12)as h:
   raw=h.read(20*1024*1024+1);r.update(http_status=h.status,mime=h.headers.get('content-type',''),bytes=len(raw));valid=raw.startswith((b'\x89PNG\r\n\x1a\n',b'\xff\xd8\xff',b'GIF8',b'RIFF'))or b'ftyp'in raw[:24]
   if valid and len(raw)<=20*1024*1024:
    p=dest/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw);r.update(status='ORIGINAL_URL_BINARY_CANDIDATE_NOT_SHA_VERIFIED',sha256=hashlib.sha256(raw).hexdigest())
   else:r['status']='NON_BINARY_OR_TOO_LARGE_REJECTED'
 except urllib.error.HTTPError as e:r.update(http_status=e.code,status='UNAVAILABLE')
 except Exception as e:r.update(status='FETCH_BLOCKED',error=str(e)[:180])
 return r
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:rows=list(pool.map(fetch,files))
Path('closure/asset-recovery-attempts.json').write_text(json.dumps({'source_commit':'42fcde8cf1b2a11422c32301b6b423d3b5d39942','preview':'Prior original preview requires authorization; no bypass attempted','original_hash_verification_available':False,'records':rows},indent=2));print({'attempted':len(rows),'binary_candidates':sum(x['status'].startswith('ORIGINAL_URL')for x in rows)})
