// Policy metadata for the SIX BORVAT console surfaces. Server integration pending.
// This is NOT an authentication system: caller identity must be proven by server session.
export const roles=Object.freeze(["buyer","seller_applicant","seller_admin","advertiser","platform_admin","seller_reviewer","catalog_reviewer","quality_reviewer","finance_operator","support_agent"]);
export const consoles=Object.freeze({
  identity:{label:"Identity & Access",permissions:["profile:read","profile:edit","session:revoke"]},
  seller:{label:"Seller Center",permissions:["offer:own:read","offer:own:write","seller_order:own:read","inventory:own:read"]},
  ads:{label:"Ads Manager",permissions:["ad_campaign:own:read","ad_campaign:own:draft"]},
  buyer:{label:"Buyer",permissions:["catalog:read","cart:own:write","buyer_order:own:read"]},
  admin:{label:"Admin",permissions:["merchant:review","catalog:review","configuration:read"]},
  trust:{label:"Trust & Safety",permissions:["risk_case:review","evidence:read","moderation:propose"]}
});
const rolePermissions=Object.freeze({
  buyer:["profile:read","profile:edit","session:revoke","catalog:read","cart:own:write","buyer_order:own:read"],
  seller_applicant:["profile:read","profile:edit","session:revoke","catalog:read"],
  seller_admin:["profile:read","profile:edit","session:revoke","catalog:read","offer:own:read","offer:own:write","seller_order:own:read","inventory:own:read","ad_campaign:own:read","ad_campaign:own:draft"],
  advertiser:["profile:read","profile:edit","session:revoke","ad_campaign:own:read","ad_campaign:own:draft"],
  platform_admin:["profile:read","profile:edit","session:revoke","configuration:read","catalog:review"],
  seller_reviewer:["profile:read","merchant:review","evidence:read"],
  catalog_reviewer:["profile:read","catalog:review","evidence:read"],
  quality_reviewer:["profile:read","risk_case:review","evidence:read","moderation:propose"],
  finance_operator:["profile:read","configuration:read"],
  support_agent:["profile:read","buyer_order:own:read"]
});
export function canAccess(session,permission,{tenantId=null,subjectTenantId=null}={}) {
  if (!session || session.authenticated!==true || typeof session.userId!=="string" || !Array.isArray(session.roles)) return false;
  if (!session.roles.every(role=>roles.includes(role))) return false;
  if (!session.roles.some(role=>rolePermissions[role].includes(permission))) return false;
  if (permission.includes(":own:")) return !!tenantId && tenantId===subjectTenantId && Array.isArray(session.tenantIds) && session.tenantIds.includes(tenantId);
  return true;
}
export function canReviewSellerApplication(session,applicantUserId,applicantCompanyId) {
  if (!canAccess(session,"merchant:review")) return false;
  if (session.userId===applicantUserId) return false;
  if (Array.isArray(session.tenantIds)&&session.tenantIds.includes(applicantCompanyId)) return false;
  return true;
}
