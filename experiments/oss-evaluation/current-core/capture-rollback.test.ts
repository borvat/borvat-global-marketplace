import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bootstrap,shutdown,makeAdmin,makeVendor,makeUser,makeProduct,makeOffer} from './helpers/harness.ts';
import {getOrCreateOpenCart,addItem} from '../src/domain/cart.ts';
import {placeOrder} from '../src/domain/checkout.ts';

test('C38 durable payment intent survives simulated successful capture then SQL failure',async()=>{
 const h=await bootstrap();let evidence:any;
 try{
  const admin=await makeAdmin(h);const vendor=await makeVendor(h,admin);const buyer=await makeUser(h);const product=await makeProduct(h,admin);const offer=await makeOffer(h,vendor,product);
  const cart=await getOrCreateOpenCart(h.app,{owner:{userId:buyer.userId},market:'NL',currency:'EUR'});
  await addItem(h.app,{owner:{userId:buyer.userId},cartId:cart.cartId,offerId:offer.id,quantity:1});
  await h.admin.query(`create function synthetic_abort_paid() returns trigger language plpgsql as $$ begin if new.status='PAID' then raise exception 'SYNTHETIC_POST_CAPTURE_FAILURE'; end if; return new; end $$; create trigger synthetic_abort_paid before update on orders for each row execute function synthetic_abort_paid();`);
  const simulatedExternalEffects:any[]=[];
  const provider={name:'isolated-fault-probe',async capture(intent:any){simulatedExternalEffects.push({key:intent.idempotencyKey,amount:intent.amountMinor.toString()});return {providerRef:'SYNTHETIC_EXTERNAL_EFFECT',status:'CAPTURED' as const};}};
  await assert.rejects(placeOrder(h.app,{userId:buyer.userId,cartId:cart.cartId,idempotencyKey:'synthetic-post-capture-fault-01',provider}),/SYNTHETIC_POST_CAPTURE_FAILURE/);
  const records=await h.admin.query(`select (select count(*)::int from orders) orders,(select count(*)::int from payments) payments,(select count(*)::int from idempotency_keys) idempotency_keys`);
  evidence={simulated_external_effects:simulatedExternalEffects,durable_records:records.rows[0],production_invariant:'A successful external effect must retain a durable intent or reconciliation record after local SQL failure',real_money:false};
  fs.writeFileSync('capture-rollback-evidence.json',JSON.stringify(evidence,null,2));
  assert.equal(simulatedExternalEffects.length,1);
  assert.ok(records.rows[0].payments>0,'No durable payment intent survived the transaction rollback after the simulated external effect');
 }finally{await shutdown(h);}
});
