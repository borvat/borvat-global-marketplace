// Isolated native runtime probes; fixture resolver is not a deployed module.
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { createSellerUser } from '../../helpers/create-seller-user'
import { createCustomerUser } from '../../helpers/create-customer-user'
import { asValue } from '@medusajs/framework/awilix'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { MercurModules, PERMISSIONS_MODULE } from '@mercurjs/types'
jest.setTimeout(120000)
medusaIntegrationTestRunner({testSuite:({getContainer,api})=>{
 const allow = {validateStatus:()=>true}
 it.each(['/admin/sellers','/admin/orders','/admin/payments','/admin/users'])('H01 seller actor cannot access %s',async(path)=>{
  const a=await createSellerUser(getContainer(),{email:'alpha@example.test',name:'Synthetic Alpha'});
  const r=await api.get(path,{...a.headers,...allow});expect([401,403]).toContain(r.status)
 })
 it.each(['/vendor/orders','/vendor/payouts','/admin/orders','/admin/sellers'])('H02 buyer actor cannot access %s',async(path)=>{
  const b=await createCustomerUser(getContainer(),{email:'buyer@example.test'});
  const r=await api.get(path,{...b.headers,...allow});expect([401,403]).toContain(r.status)
 })
 it('H03 empty opt-in permission resolver denies all and read-only grant cannot write',async()=>{
  const c=getContainer();const a=await createSellerUser(c,{email:'alpha@example.test',name:'Synthetic Alpha'});
  const cfg:any=c.resolve(ContainerRegistrationKeys.CONFIG_MODULE);const before=cfg.modules[PERMISSIONS_MODULE];
  let granted:any={};c.register(PERMISSIONS_MODULE,asValue({resolvePermissions:async()=>granted}));cfg.modules[PERMISSIONS_MODULE]={resolve:'isolated-fixture-only',disable:false};
  try {
   const deny=await api.get('/vendor/offers',{...a.headers,...allow});expect(deny.status).toBe(403);expect(deny.data.code).toBe('MISSING_PERMISSION');
   granted={offers:'view'};expect((await api.get('/vendor/offers',a.headers)).status).toBe(200);
   const write=await api.post('/vendor/offers',{},{...a.headers,...allow});expect(write.status).toBe(403);expect(write.data.code).toBe('MISSING_PERMISSION');
   const finance=await api.get('/vendor/payouts',{...a.headers,...allow});expect(finance.status).toBe(403)
  } finally {if(before===undefined)delete cfg.modules[PERMISSIONS_MODULE];else cfg.modules[PERMISSIONS_MODULE]=before;}
 })
 it('H04 queue adapter calls authenticated API and rejects foreign tenant payload',async()=>{
  const a=await createSellerUser(getContainer(),{email:'alpha@example.test',name:'Synthetic Alpha'});
  const b=await createSellerUser(getContainer(),{email:'beta@example.test',name:'Synthetic Beta'});
  // Trusted credentials are supplied by worker context, never chosen from job body.
  const execute=(job:any)=>api.post(`/vendor/sellers/${job.seller_id}`,{name:job.name},{...a.headers,...allow});
  expect((await execute({seller_id:a.seller.id,name:'Own change'})).status).toBe(200);
  expect([403,404]).toContain((await execute({seller_id:b.seller.id,name:'FORBIDDEN'})).status);
  expect((await api.get(`/vendor/sellers/${b.seller.id}`,b.headers)).data.seller.name).toBe('Synthetic Beta');
 })
 it('H05 trusted module service has no caller tenancy guard: observed boundary gap',async()=>{
  const a=await createSellerUser(getContainer(),{email:'alpha@example.test',name:'Synthetic Alpha'});
  const b=await createSellerUser(getContainer(),{email:'beta@example.test',name:'Synthetic Beta'});
  expect([403,404]).toContain((await api.post(`/vendor/sellers/${b.seller.id}`,{name:'FORBIDDEN'},{...a.headers,...allow})).status);
  const service:any=getContainer().resolve(MercurModules.SELLER);
  await service.updateSellers({id:b.seller.id,name:'TRUSTED_SERVICE_BYPASS_DEMONSTRATED'});
  expect((await api.get(`/vendor/sellers/${b.seller.id}`,b.headers)).data.seller.name).toBe('TRUSTED_SERVICE_BYPASS_DEMONSTRATED');
 })
}})

it('H07 actual framework Express resolves fixed proxy-addr and rejects cross-family spoof',()=>{
 const {createRequire}=require('node:module');
 const frameworkRequire=createRequire(require.resolve('@medusajs/framework'));
 const expressRequire=createRequire(frameworkRequire.resolve('express'));
 const proxy=expressRequire('proxy-addr');
 expect(expressRequire('proxy-addr/package.json').version).toBe('2.0.8');
 expect(proxy.compile('::/1')('203.0.113.7')).toBe(false);
 expect(proxy.compile('::/1')('::ffff:203.0.113.7')).toBe(false);
 expect(proxy.compile('::/1')('2001:db8::1')).toBe(true);
 expect(proxy.compile('10.0.0.0/8')('10.1.2.3')).toBe(true);
});
