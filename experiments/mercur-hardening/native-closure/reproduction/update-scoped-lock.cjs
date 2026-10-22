const fs=require('fs'),ts=require('../hardening/lovable-sandbox/node_modules/typescript'),semver=require('../hardening/lovable-sandbox/node_modules/semver');
const j=ts.convertToObject(ts.parseJsonText('bun.lock',fs.readFileSync('mercur/bun.lock','utf8')),[]);const metadata=JSON.parse(fs.readFileSync('closure/second-batch-metadata.json'));const allow=['brace-expansion','js-yaml','http-proxy-middleware','balanced-match'];const changed=[];
for(const [key,old]of Object.entries(j.packages))for(const m of Object.values(metadata)){
 if(!allow.includes(m.name)||!old[0].startsWith(m.name+'@'))continue;
 const v=old[0].slice(m.name.length+1);const compatible=m.name==='balanced-match'?semver.major(v)===3:semver.major(v)===semver.major(m.version);if(!compatible)continue;
 const opts={};for(const k of ['dependencies','optionalDependencies','peerDependencies','bin'])if(m[k])opts[k]=m[k];j.packages[key]=[m.name+'@'+m.version,'',opts,m.dist.integrity];changed.push({key,from:v,to:m.version});
}
const missing=[];for(const x of changed){const a=j.packages[x.key];for(const [name,range]of Object.entries(a[2].dependencies||{})){const expected=j.overrides?.[name]||range;const versions=Object.values(j.packages).filter(v=>v[0].startsWith(name+'@')).map(v=>v[0].slice(name.length+1));if(!versions.some(v=>semver.satisfies(v,expected)))missing.push({parent:x.key,name,range,versions})}}
fs.writeFileSync('closure/scoped-lock-preflight.json',JSON.stringify({changed,unresolved:missing,not_promoted:['vite','react-router','webpack-dev-middleware','sharp','image-size']},null,2));if(missing.length){console.log(missing);process.exit(2)}
fs.writeFileSync('mercur/bun.lock',JSON.stringify(j,null,2)+'\n');console.log({changed:changed.length,unresolved:0});
