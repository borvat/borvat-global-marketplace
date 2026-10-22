import {medusaIntegrationTestRunner} from '@medusajs/test-utils'
import {asValue} from '@medusajs/framework/awilix'
import {createHash} from 'node:crypto'
const names=['payment-webhook','payout-webhook','split-order-payment-captured','split-order-canceled','order-edit-confirmed','link-order-line-items-to-offers']
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
jest.setTimeout(180000)
medusaIntegrationTestRunner({testSuite:({getContainer,dbConnection})=>{
 beforeEach(async()=>{await dbConnection.raw("CREATE TABLE IF NOT EXISTS native_members(actor text,company text,active boolean,PRIMARY KEY(actor,company));CREATE TABLE IF NOT EXISTS native_resources(id text PRIMARY KEY,company text);CREATE TABLE IF NOT EXISTS native_receipts(id text,subscriber text,actor text,company text,resource text,payload_hash text,PRIMARY KEY(id,subscriber));TRUNCATE native_members,native_resources,native_receipts;INSERT INTO native_members VALUES('seller-a','A',true),('buyer-a','A',true);INSERT INTO native_resources VALUES('order-a','A'),('order-b','B')")});
 const load=(name:string)=>require('../../../packages/core/.medusa/server/src/subscribers/'+name).default;
 async function receipt(name:string,mode:string){
  const c=getContainer();const event={id:'receipt-1',data:{id:'order-a',company:'A',actor:'seller-a'}};
  if(mode!=='missing')await dbConnection.table('native_receipts').insert({id:event.id,subscriber:name,actor:mode==='buyer'?'buyer-a':'seller-a',company:'A',resource:mode==='foreign'?'order-b':'order-a',payload_hash:digest(event.data)});
  if(mode==='revoked')await dbConnection.table('native_members').where({actor:'seller-a'}).update({active:false});
  if(mode==='substituted')event.data.id='order-b';
  c.register('suroohNativeEventAuthority',asValue({assert:async(e:any,s:string)=>{
   const r=await dbConnection.table('native_receipts').where({id:e.id,subscriber:s}).first();if(!r||r.payload_hash!==digest(e.data))throw Error('AUTHORITY_RECEIPT_DENIED');
   const m=await dbConnection.table('native_members').where({actor:r.actor,company:r.company,active:true}).first();const resource=await dbConnection.table('native_resources').where({id:r.resource,company:r.company}).first();
   if(!m||r.actor.startsWith('buyer')||!resource)throw Error('AUTHORITY_SCOPE_DENIED');
  }}));return{c,event};
 }
 for(const name of names){
  it.each(['missing','revoked','foreign','substituted','buyer'])(`NA1 ${name} rejects %s producer authority before native body`,async(mode)=>{const {c,event}=await receipt(name,mode);await expect(load(name)({event,container:c})).rejects.toThrow(/AUTHORITY_(RECEIPT|SCOPE)_DENIED/)});
  it(`NA2 ${name} accepts a matching persisted authority then enters native body`,async()=>{const {c,event}=await receipt(name,'own');const container={resolve:(key:string,...args:any[])=>{if(key==='suroohNativeEventAuthority')return c.resolve(key,...args);throw Error('AUTHORIZED_NATIVE_BODY_REACHED')}};if(name==='order-edit-confirmed')await expect(load(name)({event,container:c})).resolves.toBeUndefined();else await expect(load(name)({event,container})).rejects.toThrow('AUTHORIZED_NATIVE_BODY_REACHED')});
 }
}})
