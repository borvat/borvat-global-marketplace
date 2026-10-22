import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),doc=new URL('docs/native-closure/',root),manifest=JSON.parse(await readFile(new URL('evidence/manifest.json',doc))),bad=[];
for(const f of manifest.records){if(f.path.includes('..')||!f.path.startsWith('docs/')&&!f.path.startsWith('experiments/'))throw Error('INVALID_PATH');try{if(createHash('sha256').update(await readFile(new URL(f.path,root))).digest('hex')!==f.sha256)bad.push(f.path)}catch{bad.push(f.path)}}
if(bad.length){console.log(JSON.stringify({integrity:'FAIL',mismatches:bad}));process.exit(2)}
if(process.argv.includes('--hashes-only')){console.log(JSON.stringify({integrity:'PASS',records:manifest.records.length}));process.exit(0)}
const state=JSON.parse(await readFile(new URL('readiness.json',doc))),policy=JSON.parse(await readFile(new URL('docs/execution/policy.json',root)));
const reasons=state.blockers.filter(b=>b.status!=='CLOSED').map(b=>b.id+':'+b.status);
if(!policy.foundation_decision_approved)reasons.push('FINAL_OWNER_FOUNDATION_APPROVAL_ABSENT');if(!policy.codex_execution_authorized)reasons.push('CODEX_AUTHORIZATION_ABSENT');
console.log(JSON.stringify({integrity:'PASS',hosted_ci:state.hosted_ci,alternative_verification:state.alternative_verification,C0:'HOLD',C1_ready:false,launched:false,reasons},null,2));process.exit(1);
