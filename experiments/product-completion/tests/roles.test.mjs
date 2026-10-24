import {test} from "node:test";
import assert from "node:assert/strict";
import {can} from "../prototypes/roles.mjs";
const seller={role:"seller_admin",userId:"s1",tenantId:"seller-A"};
test("seller A cannot access seller B inventory or orders",()=>{
 assert.equal(can(seller,"own_seller_order:read",{tenantId:"seller-B"}),false);
 assert.equal(can(seller,"own_stock:read",{tenantId:"seller-A"}),true);
});
test("a buyer cannot access ads, inventory, admin, settlements",()=>{
 for(const cap of ["own_campaign:write","own_offer:write","platform:read","settlement:read"]) assert.equal(can({role:"buyer",userId:"b1"},cap),false);
});
test("reviewer cannot approve own application or own risk case",()=>{
 assert.equal(can({role:"seller_reviewer",userId:"s1"},"seller_application:review",{applicantUserId:"s1"}),false);
 assert.equal(can({role:"quality_reviewer",userId:"s1"},"risk_case:review",{subjectUserId:"s1"}),false);
});
test("role does not inherit all capabilities",()=>{
 assert.equal(can({role:"platform_admin",userId:"a"},"own_offer:write",{tenantId:"x"}),false);
 assert.equal(can({role:"ad_operator",userId:"a",tenantId:"seller-A"},"own_campaign:write",{tenantId:"seller-A"}),true);
});
