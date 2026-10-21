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
}})
