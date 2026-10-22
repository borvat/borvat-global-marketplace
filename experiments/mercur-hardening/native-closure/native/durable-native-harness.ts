// Test registration only: real native service methods, PostgreSQL journal, separate synthetic provider DB.
const {Pool}=require(process.env.BORVAT_TEST_PG_MODULE!)
import {Modules} from '@medusajs/framework/utils'
import {MercurModules} from '@mercurjs/types'
export async function installNativeHarness(c:any,db:any){
 if(process.env.BORVAT_NATIVE_SYNTHETIC_ONLY!=='1')throw Error('SYNTHETIC_HARNESS_ONLY');
 const server=(await db.raw('SELECT inet_server_addr()::text host,current_database() name')).rows[0];if(!['127.0.0.1','::1'].includes(server.host.split('/')[0]))throw Error('LOOPBACK_ONLY '+JSON.stringify(server));
 const locks=new Pool({host:'127.0.0.1',port:5432,user:'postgres',password:'synthetic',database:server.name,max:4});const external=new Pool({host:'127.0.0.1',port:5432,user:'borvat_psp',password:'synthetic',database:'borvat_native_provider',max:4});
 await db.raw("CREATE TABLE IF NOT EXISTS native_financial_ops(id text PRIMARY KEY,kind text NOT NULL,company text NOT NULL,resource text NOT NULL,amount text NOT NULL,currency text NOT NULL,status text NOT NULL DEFAULT 'UNKNOWN',result jsonb); TRUNCATE native_financial_ops");
 await external.query('CREATE TABLE IF NOT EXISTS effects(id text PRIMARY KEY,kind text NOT NULL,company text NOT NULL,resource text NOT NULL,amount text NOT NULL,currency text NOT NULL,result jsonb NOT NULL);TRUNCATE effects');
 const payment:any=c.resolve(Modules.PAYMENT),payout:any=c.resolve(MercurModules.PAYOUT);let lose=false;
 const prepare=async(id:string,kind:string,resource:string,amount:unknown,currency:string)=>{
  const a=String((amount as any)?.value??amount);const fact={id,kind,company:'A',resource,amount:a,currency};
  await db.table('native_financial_ops').insert(fact).onConflict('id').ignore();const old=await db.table('native_financial_ops').where({id}).first();for(const k of Object.keys(fact))if(old[k]!==fact[k as keyof typeof fact])throw Error('IMMUTABLE_OPERATION_CONFLICT');
 };
 const effect=async(id:string)=>{
  const op=await db.table('native_financial_ops').where({id}).first();if(!op)throw Error('NO_COMMITTED_INTENT');
  const result={data:{synthetic_reference:id},status:'paid'};
  await external.query('INSERT INTO effects VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[id,op.kind,op.company,op.resource,op.amount,op.currency,result]);
  const fact=(await external.query('SELECT * FROM effects WHERE id=$1',[id])).rows[0];for(const k of ['kind','company','resource','amount','currency'])if(fact[k]!==op[k])throw Error('PROVIDER_FACT_MISMATCH');
  if(lose){lose=false;throw Error('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT')};return fact.result;
 };
 const serial=async(resource:string,fn:()=>Promise<any>)=>{const lock=await locks.connect();try{await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[resource]);return await fn()}finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[resource]);lock.release()}};
 const originalCaptureFrom=payment.capturePaymentFromProvider_.bind(payment),originalRefundFrom=payment.refundPaymentFromProvider_.bind(payment);
 const spies:any[]=[];
 spies.push(jest.spyOn(payment,'capturePaymentFromProvider_').mockImplementation(async(p:any,x:any,o:any,ctx:any)=>{if(!o.isCaptured)await prepare(x.id,'capture',p.id,x.raw_amount??x.amount,p.currency_code);return originalCaptureFrom(p,x,o,ctx)}));
 spies.push(jest.spyOn(payment,'refundPaymentFromProvider_').mockImplementation(async(p:any,x:any,ctx:any)=>{await prepare(x.id,'refund',p.id,x.raw_amount??x.amount,p.currency_code);return originalRefundFrom(p,x,ctx)}));
 spies.push(jest.spyOn(payment.paymentProviderService_,'capturePayment').mockImplementation(async(_provider:any,input:any)=>effect(input.context.idempotency_key)));
 spies.push(jest.spyOn(payment.paymentProviderService_,'refundPayment').mockImplementation(async(_provider:any,input:any)=>effect(input.context.idempotency_key)));
 spies.push(jest.spyOn(payout.payoutProviderService_,'createPayout').mockImplementation(async(input:any)=>{await prepare(input.context.idempotency_key,'payout',input.account_id,input.amount,input.currency_code);return effect(input.context.idempotency_key)}));
 for(const [service,method,resourceKey] of [[payment,'capturePayment','payment_id'],[payment,'refundPayment','payment_id'],[payout,'createPayouts','account_id']] as any[]){
  const original=service[method].bind(service);spies.push(jest.spyOn(service,method).mockImplementation(async(input:any,...rest:any[])=>serial(input[resourceKey],async()=>{
   if(rest[0]?.transactionManager||rest[0]?.manager?.isInTransaction?.())throw Error('AMBIENT_TRANSACTION_FORBIDDEN');
   if(await db.table('native_financial_ops').where({resource:input[resourceKey],status:'UNKNOWN'}).first())throw Error('RECONCILIATION_REQUIRED');
   const result=await original(input,...rest);await db.table('native_financial_ops').where({resource:input[resourceKey],status:'UNKNOWN'}).update({status:'APPLIED'});return result;
  })));
 }
 const reconcile=async(id:string,company='A')=>{const initial=await db.table('native_financial_ops').where({id}).first();if(!initial||initial.company!==company)throw Error('RECOVERY_FORBIDDEN');return serial(initial.resource,async()=>{
  const op=await db.table('native_financial_ops').where({id}).first();if(op.status==='APPLIED')return;
  const fact=(await external.query('SELECT * FROM effects WHERE id=$1',[id])).rows[0];if(!fact)throw Error('UNKNOWN_OUTCOME_MANUAL_REVIEW');for(const k of ['company','resource','amount','currency','kind'])if(fact[k]!==op[k])throw Error('PROVIDER_FACT_MISMATCH');
  if(op.kind==='payout'){await payout.updatePayouts({id,data:fact.result.data,status:'paid'})}
  else{
   const p=await payment.retrievePayment(op.resource,{relations:['captures','refunds']});
   const svc=op.kind==='capture'?payment.captureService_:payment.refundService_;
   let row=(await (op.kind==='capture'?payment.listCaptures({id}):payment.listRefunds({id})))[0];
   if(!row)row=await svc.create({id,payment:op.resource,amount:Number(op.amount)});
   if(op.kind==='capture')await originalCaptureFrom(p,row,{isFullyCaptured:Number(op.amount)===Number(p.amount),isCaptured:false});
   else await originalRefundFrom(p,row);
   await payment.maybeUpdatePaymentCollection_(p.payment_collection_id);
  }
  await db.table('native_financial_ops').where({id}).update({status:'APPLIED',result:fact.result});
 })};
 return{payment,payout,db,external,loseNext:()=>{lose=true},reconcile,close:async()=>{for(const s of spies.reverse())s.mockRestore();await locks.end();await external.end()}};
}
