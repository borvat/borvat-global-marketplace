import {medusaIntegrationTestRunner} from '@medusajs/test-utils'
import {createSellerUser} from '../../helpers/create-seller-user'
import {createPayoutAccountWorkflow} from '@mercurjs/core/workflows'
import {MercurModules} from '@mercurjs/types'
jest.setTimeout(120000)
medusaIntegrationTestRunner({testSuite:({getContainer})=>{
 it('H06 native payout must retain durable recovery row after committed provider effect and lost response',async()=>{
  const c=getContainer();const {seller}=await createSellerUser(c,{email:'durability@example.test',name:'Synthetic Durability'});
  const {result:account}=await createPayoutAccountWorkflow(c).run({input:{seller_id:seller.id,data:{},context:{}}});
  const service:any=c.resolve(MercurModules.PAYOUT);const effects:any[]=[];
  const spy=jest.spyOn(service.payoutProviderService_,'createPayout').mockImplementation(async(input:any)=>{effects.push(input.context.idempotency_key);throw Error('SYNTHETIC_RESPONSE_LOST_AFTER_EXTERNAL_COMMIT')});
  try {await expect(service.createPayouts({account_id:account.id,amount:1000,currency_code:'usd'})).rejects.toThrow('SYNTHETIC_RESPONSE_LOST');
   const rows=await service.listPayouts({account_id:account.id},{withDeleted:true});
   console.log('NATIVE_PAYOUT_DURABILITY_EVIDENCE',JSON.stringify({simulated_provider_effects:effects.length,durable_payout_rows:rows.length,real_payments:false}));
   expect(effects).toHaveLength(1);expect(rows.length).toBeGreaterThan(0);
  }finally{spy.mockRestore()}
 })
 it('H08 native payout SQL finalization failure retains committed pending record and provider key',async()=>{
  const c=getContainer();const {seller}=await createSellerUser(c,{email:'sqlfail@example.test',name:'SQL failure'});
  const {result:account}=await createPayoutAccountWorkflow(c).run({input:{seller_id:seller.id,data:{},context:{}}});
  const service:any=c.resolve(MercurModules.PAYOUT);const effects:any[]=[];
  const provider=jest.spyOn(service.payoutProviderService_,'createPayout').mockImplementation(async(input:any)=>{effects.push(input.context.idempotency_key);return {data:{synthetic_reference:'committed'},status:'paid'} as any});
  const db:any=c.resolve('__pg_connection__');
  await db.raw("CREATE FUNCTION fail_payout_finalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_SQL_FINALIZATION_FAILURE';END $$; CREATE TRIGGER fail_payout_finalize BEFORE UPDATE ON payout FOR EACH ROW EXECUTE FUNCTION fail_payout_finalize()");
  try{await expect(service.createPayouts({account_id:account.id,amount:1000,currency_code:'usd',context:{idempotency_key:'untrusted-override'}})).rejects.toThrow('SYNTHETIC_SQL');
   const rows=await service.listPayouts({account_id:account.id});expect(rows).toHaveLength(1);expect(effects).toEqual([rows[0].id]);expect(rows[0].status).toBe('pending');
  }finally{await db.raw('DROP TRIGGER IF EXISTS fail_payout_finalize ON payout;DROP FUNCTION IF EXISTS fail_payout_finalize()');provider.mockRestore()}
 })
 it('H09 native payout rejects ambient transaction before external effect',async()=>{
  const service:any=getContainer().resolve(MercurModules.PAYOUT);const provider=jest.spyOn(service.payoutProviderService_,'createPayout');
  try{await expect(service.createPayouts({account_id:'untrusted',amount:1000,currency_code:'usd'},{transactionManager:{}})).rejects.toThrow('PAYOUT_REQUIRES_INDEPENDENT_COMMITTED_INTENT');expect(provider).not.toHaveBeenCalled()}
  finally{provider.mockRestore()}
 })

}})
