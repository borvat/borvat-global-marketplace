import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql=readFileSync(new URL("../infra/sql/001_six_platform_test_schema.sql",import.meta.url),"utf8");
const tables=["sellers","memberships","products","offers","ad_campaigns","risk_cases","buyer_orders","seller_orders","audit_events"];
test("all nine marketplace tables have FORCE RLS",()=>{
 for(const table of tables){
   assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS borvat\\."+table+" \\("));
   assert.ok(sql.includes("ALTER TABLE borvat."+table+" ENABLE ROW LEVEL SECURITY;"),table+" missing enabled RLS");
   assert.ok(sql.includes("ALTER TABLE borvat."+table+" FORCE ROW LEVEL SECURITY;"),table+" missing forced RLS");
 }
});
test("buyer idempotency and seller order foreign key constraints declared",()=>{
 assert.match(sql,/UNIQUE \(buyer_id,idempotency_key\)/);
 assert.match(sql,/UNIQUE \(buyer_order_id,seller_id\)/);
 assert.match(sql,/CHECK\s*\(spent_minor >= 0 AND spent_minor <= budget_minor\)/);
});
test("seller offer reads scoped to memberships and no direct write policy",()=>{
 assert.match(sql,/CREATE POLICY offers_read_own[\s\S]*?borvat\.is_seller_member\(seller_id\)/);
 assert.doesNotMatch(sql,/CREATE POLICY.*FOR (?:INSERT|UPDATE|DELETE)/);
});
