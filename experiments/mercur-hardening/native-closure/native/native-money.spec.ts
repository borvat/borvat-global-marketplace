import {medusaIntegrationTestRunner} from '@medusajs/test-utils'
import {nativeRestore} from './native-restore'
import {installNativeHarness} from './durable-native-harness'
import {createSellerUser} from '../../helpers/create-seller-user'
import {createPayoutAccountWorkflow} from '@mercurjs/core/workflows'
jest.setTimeout(180000)
medusaIntegrationTestRunner({testSuite:({getContainer,dbConnection})=>{
 let h:any;beforeEach(async()=>{h=await installNativeHarness(getContainer(),dbConnection)});afterEach(async()=>{await h?.close()});
 async function payment(){const col=await h.payment.createPaymentCollections({currency_code:'usd',amount:1000});const session=await h.payment.createPaymentSession(col.id,{provider_id:'pp_system_default',currency_code:'usd',amount:1000,data:{}});return h.payment.authorizePaymentSession(session.id,{})}
 async function payout(){const {seller}=await createSellerUser(getContainer(),{email:'native-journal@example.test',name:'Synthetic'});return (await createPayoutAccountWorkflow(getContainer()).run({input:{seller_id:seller.id,data:{},context:{}}})).result}
 it.each(['capture','refund','payout'])('NF1 %s lost response reconciles native projection without second effect',async(kind)=>{
  let resource:any;if(kind==='payout')resource=await payout();else{resource=await payment();if(kind==='refund')await h.payment.capturePayment({payment_id:resource.id,amount:1000})}
  h.loseNext();const run=()=>kind==='payout'?h.payout.createPayouts({account_id:resource.id,amount:1000,currency_code:'usd'}):h.payment[kind+'Payment']({payment_id:resource.id,amount:1000});
  await expect(run()).rejects.toThrow('SYNTHETIC_RESPONSE_LOST');const op=await dbConnection.table('native_financial_ops').where({kind,status:'UNKNOWN'}).first();expect(op).toBeTruthy();await expect(run()).rejects.toThrow('RECONCILIATION_REQUIRED');await expect(h.reconcile(op.id,'B')).rejects.toThrow('RECOVERY_FORBIDDEN');
  await Promise.all([h.reconcile(op.id),h.reconcile(op.id),h.reconcile(op.id)]);expect((await dbConnection.table('native_financial_ops').where({id:op.id}).first()).status).toBe('APPLIED');expect((await h.external.query('SELECT * FROM effects WHERE id=$1',[op.id])).rows).toHaveLength(1);
  if(kind==='payout')expect((await h.payout.retrievePayout(op.id)).status).toBe('paid');else expect(await (kind==='capture'?h.payment.listCaptures({id:op.id}):h.payment.listRefunds({id:op.id}))).toHaveLength(1);
 });
 it.each(['capture','refund','payout'])('NF2 %s provider commit followed by real SQL failure recovers',async(kind)=>{
  let resource:any;if(kind==='payout')resource=await payout();else{resource=await payment();if(kind==='refund')await h.payment.capturePayment({payment_id:resource.id,amount:1000})}
  const table=kind==='payout'?'payout':'payment';await dbConnection.raw(`CREATE FUNCTION financial_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_FINALIZE_SQL';END $$;CREATE TRIGGER financial_fault BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION financial_fault()`);
  try{await expect(kind==='payout'?h.payout.createPayouts({account_id:resource.id,amount:1000,currency_code:'usd'}):h.payment[kind+'Payment']({payment_id:resource.id,amount:1000})).rejects.toThrow('SYNTHETIC_FINALIZE_SQL')}
  finally{await dbConnection.raw(`DROP TRIGGER financial_fault ON ${table};DROP FUNCTION financial_fault()`)}
  const op=await dbConnection.table('native_financial_ops').where({kind,status:'UNKNOWN'}).first();expect(op).toBeTruthy();await h.reconcile(op.id);expect((await dbConnection.table('native_financial_ops').where({id:op.id}).first()).status).toBe('APPLIED');expect((await h.external.query('SELECT * FROM effects WHERE id=$1',[op.id])).rows).toHaveLength(1);
 });
 it('NR5 full native PostgreSQL dump/restore preserves rows/constraints and rehearses migration rollback',async()=>{const p=await payment();await h.payment.capturePayment({payment_id:p.id,amount:1000});const result=await nativeRestore(dbConnection);expect(result.tables).toBeGreaterThan(100);expect(result.status).toBe('PASS')});

}})
