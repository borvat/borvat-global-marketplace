import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGate} from '../../scripts/foundation/gate.mjs';
const sha='a'.repeat(40),hash='b'.repeat(64);
const stage={id:'C1',depends_on:['C0'],required_acceptance:['A02']};
const policy={foundation_decision_approved:true,codex_execution_authorized:true,advancement_enabled:true,automatic_main_merge:false,automatic_deployment:false,live_payments:false,production_database_writes:false};
const receipt=()=>({stage:'C1',commit_sha:sha,unresolved_p0_p1:0,prerequisites:{C0:'VERIFIED'},owner_review:{stage:'C1',commit_sha:sha,decision:'approved',review_url:'https://github.com/borvat/borvat-global-marketplace/pull/999#review'},acceptance:[{id:'A02',status:'PASS',exit_code:0,commit_sha:sha,command:'isolated test',log_sha256:hash}]});
test('owner hold denies even otherwise complete evidence',()=>{const r=evaluateGate({...policy,codex_execution_authorized:false,advancement_enabled:false},stage,receipt());assert.equal(r.eligible,false);assert.ok(r.reasons.includes('OWNER_AUTHORIZATION_ABSENT'));});
test('changed SHA invalidates approval and acceptance evidence',()=>{const r=receipt();r.commit_sha='c'.repeat(40);assert.equal(evaluateGate(policy,stage,r).eligible,false);});
test('failed or not-run evidence cannot unlock next stage',()=>{for(const status of ['FAIL','NOT_RUN','BLOCKED']){const r=receipt();r.acceptance[0].status=status;assert.equal(evaluateGate(policy,stage,r).eligible,false);}});
test('missing prerequisite and open critical finding block',()=>{const r=receipt();r.prerequisites={};r.unresolved_p0_p1=1;assert.equal(evaluateGate(policy,stage,r).eligible,false);});
test('forbidden merge/deploy/money policy always denied',()=>{for(const flag of ['automatic_main_merge','automatic_deployment','live_payments','production_database_writes'])assert.equal(evaluateGate({...policy,[flag]:true},stage,receipt()).eligible,false);});
test('missing and malformed evidence fail closed',()=>{assert.equal(evaluateGate(policy,stage,null).eligible,false);const r=receipt();r.acceptance[0].log_sha256='none';assert.equal(evaluateGate(policy,stage,r).eligible,false);});
test('offline complete proposal is inspection only and does not mutate policy',()=>{const copy=structuredClone(policy);assert.equal(evaluateGate(copy,stage,receipt()).eligible,true);assert.deepEqual(copy,policy);});

test('Codex authorization alone cannot bypass an unapproved foundation decision',()=>{for(const value of [false,undefined]){const r=evaluateGate({...policy,foundation_decision_approved:value},stage,receipt());assert.equal(r.eligible,false);assert.ok(r.reasons.includes('FOUNDATION_DECISION_NOT_APPROVED'));}});

test('preferred candidate and research acceptance do not authorize implementation',()=>{const r=evaluateGate({...policy,research_results_accepted:true,candidate_design_accepted:true,foundation_decision_approved:false,codex_execution_authorized:false,advancement_enabled:false},stage,receipt());assert.equal(r.eligible,false);assert.ok(r.reasons.includes('OWNER_AUTHORIZATION_ABSENT'));assert.ok(r.reasons.includes('FOUNDATION_DECISION_NOT_APPROVED'));});
