import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function evaluateGate(policy,stage,receipt) {
 const reasons=[];
 if(!policy.codex_execution_authorized||!policy.advancement_enabled)reasons.push('OWNER_AUTHORIZATION_ABSENT');
 if(policy.foundation_decision_approved!==true)reasons.push('FOUNDATION_DECISION_NOT_APPROVED');
 if(policy.automatic_main_merge||policy.automatic_deployment||policy.live_payments||policy.production_database_writes)reasons.push('FORBIDDEN_POLICY');
 if(!stage||!receipt)return {eligible:false,reasons:[...reasons,'MISSING_STAGE_OR_EVIDENCE']};
 if(!/^[a-f0-9]{40}$/.test(receipt.commit_sha??''))reasons.push('UNPINNED_COMMIT');
 if(receipt.stage!==stage.id)reasons.push('STAGE_MISMATCH');
 if(!receipt.owner_review||receipt.owner_review.commit_sha!==receipt.commit_sha||receipt.owner_review.stage!==stage.id||receipt.owner_review.decision!=='approved'||!receipt.owner_review.review_url?.startsWith('https://github.com/borvat/borvat-global-marketplace/pull/'))reasons.push('MISSING_COMMIT_BOUND_REVIEW');
 if((receipt.unresolved_p0_p1??1)!==0)reasons.push('OPEN_CRITICAL_FINDINGS');
 for(const dependency of stage.depends_on)if(receipt.prerequisites?.[dependency]!=='VERIFIED')reasons.push('UNVERIFIED_PREREQUISITE:'+dependency);
 for(const id of stage.required_acceptance) {
  const proof=receipt.acceptance?.find(x=>x.id===id);
  if(!proof||proof.status!=='PASS'||proof.exit_code!==0||proof.commit_sha!==receipt.commit_sha||!proof.command||!/^[a-f0-9]{64}$/.test(proof.log_sha256??''))reasons.push('UNVERIFIED_ACCEPTANCE:'+id);
 }
 return {eligible:reasons.length===0,reasons,notice:'Offline evaluation is not authentication of human review and never starts an agent, advances persisted state, merges or deploys.'};
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const policy=JSON.parse(fs.readFileSync(path.join(root,'docs/execution/policy.json')));
 const stage=JSON.parse(fs.readFileSync(path.join(root,'docs/execution/stages.json'))).stages.find(s=>s.id===process.argv[2]);
 const receipt=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3])):null;
 const result=evaluateGate(policy,stage,receipt);console.log(JSON.stringify(result,null,2));
 if(!result.eligible)process.exitCode=1;
}
