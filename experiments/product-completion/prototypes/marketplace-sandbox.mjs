// BORVAT integrated, in-memory six-console sandbox.
// No real customer data, payments, advertising spend or production permissions.
export function createMarketplaceSandbox() {
  const state={users:new Map(),sellers:new Map(),offers:new Map(),ads:new Map(),risk:new Map(),orders:new Map(),orderKeys:new Map(),audit:[]};
  let seq=0;const id=p=>p+"-"+(++seq);
  const record=(actor,action,target)=>state.audit.push({id:id("event"),actor:actor.id,action,target});
  const requireRole=(actor,roles)=>{if(!actor||!state.users.has(actor.id)||state.users.get(actor.id)!==actor||!roles.includes(actor.role))throw Error("FORBIDDEN")};
  const requireSeller=(actor,sellerId)=>{requireRole(actor,["seller"]);if(actor.sellerId!==sellerId)throw Error("TENANT_FORBIDDEN");const s=state.sellers.get(sellerId);if(!s||s.status!=="approved")throw Error("SELLER_NOT_APPROVED")};
  const nonneg=n=>Number.isSafeInteger(n)&&n>=0;
  return Object.freeze({
    createUser(role) {if(!["buyer","seller","admin","reviewer","ad_operator"].includes(role))throw Error("ROLE");const user=Object.freeze({id:id("user"),role,sellerId:null});state.users.set(user.id,user);return user},
    applySeller(actor,name) {requireRole(actor,["seller"]);if(actor.sellerId)throw Error("ALREADY_APPLIED");if(!name||typeof name!=="string")throw Error("NAME");const sellerId=id("seller");const seller={id:sellerId,name,status:"pending",ownerId:actor.id};state.sellers.set(sellerId,seller);const updated=Object.freeze({...actor,sellerId});state.users.set(actor.id,updated);record(updated,"seller.apply",sellerId);return {seller:{...seller},actor:updated}},
    reviewSeller(actor,sellerId,approve){requireRole(actor,["reviewer"]);const s=state.sellers.get(sellerId);if(!s)throw Error("NOT_FOUND");if(s.ownerId===actor.id)throw Error("SELF_REVIEW");s.status=approve?"approved":"rejected";record(actor,"seller.review",sellerId);return {...s}},
    listSellers(actor){requireRole(actor,["admin","reviewer"]);return [...state.sellers.values()].map(s=>({...s}))},
    addOffer(actor,offer){requireSeller(actor,actor.sellerId);if(!offer||typeof offer.productId!=="string"||!offer.productId||!nonneg(offer.priceMinor)||!nonneg(offer.stock)||!nonneg(offer.shippingMinor)||offer.currency!=="EUR"||offer.market!=="NL")throw Error("OFFER_INVALID");const result={id:id("offer"),sellerId:actor.sellerId,productId:offer.productId,priceMinor:offer.priceMinor,shippingMinor:offer.shippingMinor,stock:offer.stock,currency:"EUR",market:"NL",status:"pending"};state.offers.set(result.id,result);record(actor,"offer.submit",result.id);return {...result}},
    reviewOffer(actor,offerId,approve){requireRole(actor,["reviewer"]);const o=state.offers.get(offerId);if(!o)throw Error("NOT_FOUND");o.status=approve?"published":"rejected";record(actor,"offer.review",offerId);return {...o}},
    listOffers(actor){requireRole(actor,["buyer","seller","admin","reviewer"]);return [...state.offers.values()].filter(o=>actor.role!=="seller"?o.status==="published"||["admin","reviewer"].includes(actor.role):o.sellerId===actor.sellerId).map(o=>({...o}))},
    quote(actor,offerIds){requireRole(actor,["buyer"]);if(!Array.isArray(offerIds)||!offerIds.length||offerIds.length>20)throw Error("CART_INVALID");const lines=offerIds.map(offerId=>{const o=state.offers.get(offerId);if(!o||o.status!=="published"||o.stock<1||state.risk.get(offerId)?.status==="held")throw Error("NOT_AVAILABLE");return {offerId,sellerId:o.sellerId,priceMinor:o.priceMinor,shippingMinor:o.shippingMinor}});if(new Set(offerIds).size!==offerIds.length)throw Error("DUPLICATE_OFFER");const totalMinor=lines.reduce((a,l)=>a+l.priceMinor+l.shippingMinor,0);if(!Number.isSafeInteger(totalMinor))throw Error("OVERFLOW");return {demo:true,lines,totalMinor,currency:"EUR",paymentEnabled:false}},
    createDemoOrder(actor,offerIds,requestKey) {
      requireRole(actor,["buyer"]);
      if(typeof requestKey!=="string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey))throw Error("IDEMPOTENCY_KEY_REQUIRED");
      const scopedKey=actor.id+":"+requestKey;
      if(state.orderKeys.has(scopedKey)) {
        const previous=state.orderKeys.get(scopedKey);
        if(JSON.stringify(previous.offerIds)!==JSON.stringify(offerIds))throw Error("IDEMPOTENCY_CONFLICT");
        return structuredClone(state.orders.get(previous.orderId));
      }
      const quote=this.quote(actor,offerIds);
      // Demonstration-only atomic stock decrement: production requires a DB transaction.
      for(const line of quote.lines) state.offers.get(line.offerId).stock-=1;
      const order={id:id("order"),buyerId:actor.id,sellerOrders:quote.lines.map(l=>({sellerId:l.sellerId,offerId:l.offerId,status:"created"})),totalMinor:quote.totalMinor,paid:false,demo:true};state.orders.set(order.id,order);state.orderKeys.set(scopedKey,{offerIds:[...offerIds],orderId:order.id});record(actor,"order.demo_create",order.id);return structuredClone(order)},
    sellerOrders(actor){requireSeller(actor,actor.sellerId);return [...state.orders.values()].flatMap(o=>o.sellerOrders.filter(s=>s.sellerId===actor.sellerId).map(s=>({...s,orderId:o.id})))},
    createCampaign(actor,{sellerId,budgetMinor}){requireRole(actor,["ad_operator"]);if(!state.sellers.has(sellerId)||!nonneg(budgetMinor))throw Error("CAMPAIGN_INVALID");const c={id:id("campaign"),sellerId,budgetMinor,spentMinor:0,status:"pending",demo:true};state.ads.set(c.id,c);record(actor,"ads.create",c.id);return {...c}},
    approveCampaign(actor,campaignId){requireRole(actor,["admin"]);const c=state.ads.get(campaignId);if(!c)throw Error("NOT_FOUND");c.status="approved";record(actor,"ads.approve",campaignId);return {...c}},
    simulateAdSpend(actor,campaignId,amount){requireRole(actor,["ad_operator"]);const c=state.ads.get(campaignId);if(!c||c.status!=="approved"||!nonneg(amount)||!Number.isSafeInteger(c.spentMinor+amount)||c.spentMinor+amount>c.budgetMinor)throw Error("BUDGET_CAP");c.spentMinor+=amount;record(actor,"ads.demo_spend",campaignId);return {...c}},
    flagOffer(actor,offerId,reason){requireRole(actor,["reviewer"]);if(!state.offers.has(offerId)||!reason)throw Error("RISK_INVALID");state.risk.set(offerId,{status:"held",reason,reviewerId:actor.id});record(actor,"risk.hold",offerId);return {offerId,status:"held"}},
    resolveRisk(actor,offerId){requireRole(actor,["admin"]);const issue=state.risk.get(offerId);if(!issue)throw Error("NOT_FOUND");state.risk.delete(offerId);record(actor,"risk.release",offerId);return {offerId,status:"released"}},
    audit(actor){requireRole(actor,["admin"]);return state.audit.map(e=>({...e}))}
  });
}
