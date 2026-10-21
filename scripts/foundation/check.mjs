import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const spec=json('docs/mission03/04-openapi.json');
const ids=[];
function walk(x){if(!x||typeof x!=='object')return;if(x.$ref){assert.ok(x.$ref.startsWith('#/'));let target=spec;for(const k of x.$ref.slice(2).split('/'))target=target[k];assert.notEqual(target,undefined);}Object.values(x).forEach(walk);}
walk(spec);
for(const [p,ops] of Object.entries(spec.paths))for(const op of Object.values(ops)) {
 ids.push(op.operationId);
 for(const [,param]of p.matchAll(/\{([^}]+)\}/g))assert.ok(op.parameters.some(v=>v.in==='path'&&v.name===param));
}
assert.equal(new Set(ids).size,ids.length);
const cases=json('docs/mission03/06-acceptance.json').cases;
assert.equal(cases.length,35);assert.equal(new Set(cases.map(c=>c.id)).size,35);
assert.ok(cases.every(c=>c.status==='NOT_RUN'));
const policy=json('docs/execution/policy.json');
for(const k of ['codex_execution_authorized','advancement_enabled','automatic_main_merge','automatic_deployment','live_payments','production_database_writes'])assert.equal(policy[k],false);
assert.equal(json('docs/execution/stages.json').stages.length,7);
assert.equal(json('docs/architecture/module-map.json').modules.length,12);
assert.ok(!fs.existsSync(path.join(root,'apps/marketplace/.env')));
const workflow=read('.github/workflows/preparation.yml');assert.ok(!workflow.includes('pull_request_target'));assert.ok(!workflow.includes('write-all'));assert.ok(workflow.includes('contents: read'));
console.log(JSON.stringify({status:'PASS',api_operations:ids.length,acceptance_specifications:35,modules:12,stages:7,execution:'ON_HOLD',note:'Contract/reference/policy checks only; no full OpenAPI metaschema validation or production certification'}));
