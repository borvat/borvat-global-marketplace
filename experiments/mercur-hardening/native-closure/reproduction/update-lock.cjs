const fs=require('fs'),ts=require('../hardening/lovable-sandbox/node_modules/typescript'),semver=require('../hardening/lovable-sandbox/node_modules/semver');
const ast=ts.parseJsonText('bun.lock',fs.readFileSync('closure/bun-before.lock','utf8'));const j=ts.convertToObject(ast,[]),metadata=JSON.parse(fs.readFileSync('closure/verified-package-metadata.json')),pkg=JSON.parse(fs.readFileSync('mercur/package.json'));
for(const [name,m] of Object.entries(metadata)){
 pkg.overrides[name]=m.version;
 const matches=Object.entries(j.packages).filter(([k,v])=>v[0].startsWith(name+'@'));
 if(!matches.length)matches.push([name,null]);
 const options={};for(const k of ['dependencies','optionalDependencies','peerDependencies','bin'])if(m[k])options[k]=m[k];
 const peers=Object.entries(m.peerDependenciesMeta||{}).filter(([,v])=>v.optional).map(([k])=>k);if(peers.length)options.optionalPeers=peers;
 for(const [key] of matches)j.packages[key]=[name+'@'+m.version,'',options,m.dist.integrity];
}
j.overrides=pkg.overrides;
const unresolved=[];
for(const [name,m]of Object.entries(metadata))for(const [child,range]of Object.entries(m.dependencies||{})){
 const expected=pkg.overrides[child]||range;const existing=Object.values(j.packages).filter(v=>v[0].startsWith(child+'@')).map(v=>v[0].slice(child.length+1));if(!existing.some(v=>semver.satisfies(v,expected)))unresolved.push({parent:name,child,range:expected,available:existing});
}
fs.writeFileSync('closure/lock-dependency-preflight.json',JSON.stringify({unresolved,metadata_pins:Object.fromEntries(Object.entries(metadata).map(([n,m])=>[n,m.version]))},null,2));
if(unresolved.length){console.log(unresolved);process.exit(2)}
fs.writeFileSync('mercur/package.json',JSON.stringify(pkg,null,2)+'\n');fs.writeFileSync('mercur/bun.lock',JSON.stringify(j,null,2)+'\n');console.log('exact metadata lock candidate generated; frozen installer and runtime tests still required');
