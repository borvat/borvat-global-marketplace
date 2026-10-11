// BORVAT test-only authorization reference. No production session or database.
export const roles=Object.freeze(["buyer","seller_admin","ad_operator","seller_reviewer","quality_reviewer","finance_operator","platform_admin"]);
const grants=Object.freeze({
 buyer:["catalog:read","cart:write","own_order:read"],
 seller_admin:["catalog:read","own_offer:write","own_stock:read","own_seller_order:read"],
 ad_operator:["own_campaign:write","own_campaign:read"],
 seller_reviewer:["seller_application:review"],
 quality_reviewer:["risk_case:review","risk_case:read"],
 finance_operator:["settlement:read"],
 platform_admin:["platform:read","settings:write"]
});
export function can(actor,capability,resource={}) {
  if(!actor || !roles.includes(actor.role) || typeof capability!=="string") return false;
  if(!grants[actor.role].includes(capability)) return false;
  if(capability.startsWith("own_") && (!resource.tenantId || resource.tenantId!==actor.tenantId)) return false;
  if(capability==="seller_application:review" && actor.userId===resource.applicantUserId) return false;
  if(capability==="risk_case:review" && actor.userId===resource.subjectUserId) return false;
  return true;
}
