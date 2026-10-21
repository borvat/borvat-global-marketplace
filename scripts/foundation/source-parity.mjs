import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/source-recovery/manifest.json')));
let bad=[];let checked=0;
for(const f of manifest.records.filter(x=>x.status==='RECOVERED_TEXT')) {
 const destination=path.resolve(root,f.destination);
 if(!destination.startsWith(root+path.sep))throw Error('Invalid destination');
 if(!fs.existsSync(destination)){bad.push({source:f.source,error:'missing'});continue;}
 const hash=crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
 if(hash!==f.sha256)bad.push({source:f.source,error:'hash mismatch'});else checked++;
}
const unresolved=manifest.records.filter(x=>x.status==='BINARY_NOT_RECOVERED');
console.log(JSON.stringify({verified_text:checked,total_text:manifest.eligible_text_count,unresolved_binary:unresolved.length,excluded_secret_configs:manifest.records.filter(x=>x.status==='EXCLUDED_SECRET_CONFIG').length,mismatches:bad},null,2));
if(bad.length||checked!==manifest.eligible_text_count||(process.argv.includes('--require-assets')&&unresolved.length))process.exitCode=1;
