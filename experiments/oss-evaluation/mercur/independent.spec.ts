// BORVAT-authored probes, synthetic local fixtures only.
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { createSellerUser } from '../../helpers/create-seller-user'
import { createCustomerUser } from '../../helpers/create-customer-user'
jest.setTimeout(120000)
medusaIntegrationTestRunner({testSuite:({getContainer,api})=>{
 it('M01 anonymous vendor read is denied',async()=>{
  const r=await api.get('/vendor/offers',{validateStatus:()=>true});expect(r.status).toBe(401)
 })
 it('M02 customer identity cannot become a vendor by adding seller header',async()=>{
  const seller=await createSellerUser(getContainer(),{email:'alpha@example.test',name:'Synthetic Alpha'})
  const buyer=await createCustomerUser(getContainer(),{email:'buyer@example.test'})
  const r=await api.get('/vendor/offers',{headers:{...buyer.headers.headers,'x-seller-id':seller.seller.id},validateStatus:()=>true});expect([401,403]).toContain(r.status)
 })
 it('M03 own seller read works but foreign seller ID read and write are denied',async()=>{
  const a=await createSellerUser(getContainer(),{email:'alpha@example.test',name:'Synthetic Alpha'})
  const b=await createSellerUser(getContainer(),{email:'beta@example.test',name:'Synthetic Beta'})
  expect((await api.get(`/vendor/sellers/${a.seller.id}`,a.headers)).status).toBe(200)
  const denied=await api.get(`/vendor/sellers/${b.seller.id}`,{...a.headers,validateStatus:()=>true});expect([403,404]).toContain(denied.status)
  const write=await api.post(`/vendor/sellers/${b.seller.id}`,{name:'FORBIDDEN'},{...a.headers,validateStatus:()=>true});expect([403,404]).toContain(write.status)
  const unchanged=await api.get(`/vendor/sellers/${b.seller.id}`,b.headers);expect(unchanged.data.seller.name).toBe('Synthetic Beta')
 })
 it('M04 forged x-seller-id does not grant membership',async()=>{
  const a=await createSellerUser(getContainer(),{email:'alpha@example.test',name:'Synthetic Alpha'})
  const b=await createSellerUser(getContainer(),{email:'beta@example.test',name:'Synthetic Beta'})
  const denied=await api.get('/vendor/offers',{headers:{...a.headers.headers,'x-seller-id':b.seller.id},validateStatus:()=>true});expect(denied.status).toBe(400);expect(denied.data.message).toContain('You are not a member of this seller account');expect(denied.data.offers).toBeUndefined()
 })
}})
