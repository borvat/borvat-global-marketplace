import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),doc=new URL('docs/blocker-resolution/',root);
const manifest=JSON.parse(await readFile(new URL('evidence/manifest.json',doc)));
const mismatches=[];
for(const x of manifest.records){if(x.path.includes('..')||!x.path.startsWith('docs/')&&!x.path.startsWith('experiments/'))throw Error('INVALID_EVIDENCE_PATH');try{const actual=createHash('sha256').update(await readFile(new URL(x.path,root))).digest('hex');if(actual!==x.sha256)mismatches.push(x.path)}catch{mismatches.push(x.path)}}
if(mismatches.length){console.log(JSON.stringify({integrity:'FAIL',mismatches}));process.exit(2)}
if(process.argv.includes('--hashes-only')){console.log(JSON.stringify({integrity:'PASS',records:manifest.records.length}));process.exit(0)}
const state=JSON.parse(await readFile(new URL('readiness.json',doc))),policy=JSON.parse(await readFile(new URL('docs/execution/policy.json',root)));
const reasons=state.blockers.filter(x=>x.status!=='CLOSED').map(x=>x.id);
if(!policy.foundation_decision_approved)reasons.push('FINAL_FOUNDATION_OWNER_APPROVAL_ABSENT');
if(!policy.codex_execution_authorized)reasons.push('CODEX_STAGE_AUTHORIZATION_ABSENT');
console.log(JSON.stringify({integrity:'PASS',hosted_ci:state.hosted_ci,execution:reasons.length?'HOLD':'REQUIRES_EXTERNAL_OWNER_REVIEW',codex_started:false,reasons},null,2));
process.exit(1); // This inspection tool never launches or authorizes any implementation.
