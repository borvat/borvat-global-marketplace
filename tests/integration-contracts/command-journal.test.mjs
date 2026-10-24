import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandJournal } from '../../packages/integration-contracts/command-journal.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(),'borvat-command-test-'));
  const config = { path:join(dir,'commands.sqlite'),authorize:(p,c)=>p?.company===c };
  const journals = [];
  const open = () => { const j = new CommandJournal(config); journals.push(j); return j; };
  t.after(()=>{for(const j of journals) {try{j.close();}catch{}}rmSync(dir,{recursive:true,force:true});});
  return {open,config};
}
const actor = {company:'TEST-A'};
const intent = {company:'TEST-A',source:'borvat',operation:'reserve_bundle',externalKey:'TEST-ORDER-1',
  payload:{nativeSku:'TEST-SKU',quantity:1}};
const result = e => ({commandId:e.command_id,company:e.company_id,status:'completed',references:['TEST-NATIVE-1']});

test('real SQLite journal survives close/reopen; canonical same-key dedup and conflict',t=>{
  const {open}=fixture(t);const j=open();const first=j.enqueue(actor,intent);
  assert.equal(j.enqueue(actor,{...intent,payload:{quantity:1,nativeSku:'TEST-SKU'}}).id,first.id);
  assert.throws(()=>j.enqueue(actor,{...intent,payload:{quantity:2}}),/payload conflict/);
  j.close();const recovered=open().get(actor,'TEST-A',first.id);
  assert.equal(recovered.state,'pending');assert.equal(recovered.dispatches,0);
});

test('two actual SQLite connections serialize claims; one external dispatch',async t=>{
  const {open}=fixture(t);const j=open(), other=open();const {id}=j.enqueue(actor,intent);
  let calls=0, release;const waiting=new Promise(r=>{release=r;});
  const receiver={mode:'test',durableIdempotency:true,lookup:async()=>({kind:'absent',authoritative:true}),
    execute:async e=>{calls++;await waiting;return result(e);}};
  const a=j.run(actor,'TEST-A',id,receiver);
  await new Promise(r=>setImmediate(r));
  assert.equal((await other.run(actor,'TEST-A',id,receiver)).state,'dispatching');
  release();assert.equal((await a).state,'completed');assert.equal(calls,1);
});

test('committed-but-lost remote response is recovered after restart without second effect',async t=>{
  const {open}=fixture(t);const j=open();const {id}=j.enqueue(actor,intent);
  let remote, calls=0;
  const receiver={mode:'test',durableIdempotency:true,lookup:async()=>remote?{kind:'found',evidence:remote}:{kind:'absent',authoritative:true},
    execute:async e=>{calls++;remote=result(e);throw Error('connection dropped after commit');}};
  assert.equal((await j.run(actor,'TEST-A',id,receiver)).state,'unknown');j.close();
  const recovered=await open().run(actor,'TEST-A',id,receiver);
  assert.equal(recovered.state,'completed');assert.equal(calls,1);assert.equal(recovered.dispatches,1);
});

test('ambiguous lookup, invalid evidence and production receivers never confirm success',async t=>{
  const {open}=fixture(t);const j=open();const {id}=j.enqueue(actor,intent);let calls=0;
  const receiver={mode:'test',durableIdempotency:true,lookup:async()=>({kind:'unknown'}),execute:async()=>{calls++;}};
  assert.equal((await j.run(actor,'TEST-A',id,receiver)).state,'unknown');assert.equal(calls,0);
  await assert.rejects(j.run(actor,'TEST-A',id,{...receiver,mode:'live'}),/explicit test/);
  receiver.lookup=async()=>({kind:'found',evidence:{commandId:id,company:'TEST-B',status:'completed',references:['foreign']}});
  assert.equal((await j.run(actor,'TEST-A',id,receiver)).state,'unknown');assert.equal(calls,0);
});

test('current authorization and company lookup prevent foreign reads/dispatch',async t=>{
  const {open}=fixture(t);const j=open();const {id}=j.enqueue(actor,intent);
  assert.throws(()=>j.get({company:'TEST-B'},'TEST-A',id),/scope denied/);
  assert.throws(()=>j.get({company:'TEST-B'},'TEST-B',id),/not found/);
  await assert.rejects(j.run({company:'TEST-B'},'TEST-A',id,{}),/scope denied/);
  assert.throws(()=>j.enqueue(actor,{...intent,payload:{x:NaN}}),/finite JSON/);
});

test('bounded unchanged-key retries remain unknown and visible rather than disappearing',async t=>{
  const {open}=fixture(t);const j=open();const {id}=j.enqueue(actor,intent);let calls=0;
  const receiver={mode:'test',durableIdempotency:true,lookup:async()=>({kind:'absent',authoritative:true}),
    execute:async()=>{calls++;throw Error('before receiver commit');}};
  for(let i=0;i<5;i++) assert.equal((await j.run(actor,'TEST-A',id,receiver)).state,'unknown');
  assert.equal(calls,3);assert.equal(j.get(actor,'TEST-A',id).dispatches,3);
});

test('actual SIGKILL after remote commit leaves a recoverable durable lease',async t=>{
  const {config,open}=fixture(t);
  const {spawn}=await import('node:child_process');
  const {readFileSync}=await import('node:fs');
  const remotePath=join(config.path,'..','remote-test-double.json');
  const j=open();const {id}=j.enqueue(actor,intent);
  const moduleUrl=new URL('../../packages/integration-contracts/command-journal.mjs',import.meta.url).href;
  const program=`import {CommandJournal} from ${JSON.stringify(moduleUrl)};
    import {writeFileSync} from 'node:fs';
    const j=new CommandJournal({path:${JSON.stringify(config.path)},authorize:()=>true});
    await j.run({company:'TEST-A'},'TEST-A',${JSON.stringify(id)},{mode:'test',durableIdempotency:true,
      lookup:async()=>({kind:'absent',authoritative:true}),execute:async e=>{
        writeFileSync(${JSON.stringify(remotePath)},JSON.stringify({commandId:e.command_id,company:'TEST-A',status:'completed',references:['TEST-NATIVE-KILL']}));
        console.log('COMMITTED');await new Promise(()=>setInterval(()=>{},1000));
      }});`;
  const child=spawn(process.execPath,['--input-type=module','-e',program],{stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Child did not reach commit')),5000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.stdout.on('data',d=>{if(String(d).includes('COMMITTED')){clearTimeout(timer);resolve();}});
  });
  const exited=new Promise(resolve=>child.once('exit',(_code,signal)=>resolve(signal)));child.kill('SIGKILL');assert.equal(await exited,'SIGKILL');
  const recovered=new CommandJournal({...config,now:()=>Date.now()+60_000});
  t.after(()=>recovered.close());
  let dispatched=0;
  const status=await recovered.run(actor,'TEST-A',id,{mode:'test',durableIdempotency:true,
    lookup:async()=>({kind:'found',evidence:JSON.parse(readFileSync(remotePath,'utf8'))}),
    execute:async()=>{dispatched++;throw Error('must not resend');}});
  assert.equal(status.state,'completed');assert.equal(dispatched,0);assert.equal(status.dispatches,1);
});
