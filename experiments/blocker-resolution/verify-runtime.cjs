// Offline preflight for a disposable pinned Mercur checkout; no installer/network.
const {createRequire}=require('node:module');const {resolve,dirname}=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const root=resolve(process.argv[2]||'.');const local=JSON.parse(fs.readFileSync(resolve(root,'packages/core/package.json')));assert.equal(local.name,'@mercurjs/core');assert.equal(local.version,'2.3.7');
const r=createRequire(resolve(root,'integration-tests/package.json'));const f=createRequire(r.resolve('@medusajs/framework'));const e=createRequire(f.resolve('express'));const proxy=e('proxy-addr');
const fact={framework:JSON.parse(fs.readFileSync(resolve(dirname(f.resolve('@medusajs/framework')),'../package.json'))).version,express:e('./package.json').version,proxy:e('proxy-addr/package.json').version,express_path:f.resolve('express'),proxy_path:e.resolve('proxy-addr')};
assert.equal(fact.framework,'2.21.2');assert.equal(fact.express,'4.22.3');assert.equal(fact.proxy,'2.0.8');
assert.equal(proxy.compile('::/1')('203.0.113.7'),false);assert.equal(proxy.compile('::/1')('::ffff:203.0.113.7'),false);assert.equal(proxy.compile('::/1')('2001:db8::1'),true);assert.equal(proxy.compile('10.0.0.0/8')('10.1.2.3'),true);
console.log(JSON.stringify({status:'PASS',...fact},null,2));
