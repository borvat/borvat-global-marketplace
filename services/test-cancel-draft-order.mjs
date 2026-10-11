// ISOLATED TEST workflow. Cancel only an unpaid draft; restore each reserved line once.
// A trusted server must authorize the authenticated buyer, and a privileged isolated DB
// worker must run this transaction. Never expose as a browser-accessible SQL operation.
import {randomUUID} from "node:crypto";
export class CancelError extends Error {constructor(code){super(code);this.name="CancelError"}}
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function cancelDraftTestOrder(pool,{buyerId,orderId},{authorizeBuyer}={}){
 if(typeof authorizeBuyer!=="function")throw new CancelError("AUTH_NOT_CONFIGURED");
 if(!uuid(buyerId)||!uuid(orderId))throw new CancelError("INVALID_REQUEST");
 const buyer=buyerId.toLowerCase(),order=orderId.toLowerCase();
 if(await authorizeBuyer(buyer)!==true)throw new CancelError("UNAUTHORIZED");
 const db=await pool.connect();let started=false;
 try{
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");started=true;
  const parent=await db.query("SELECT id,state FROM borvat.buyer_orders WHERE id=$1 AND buyer_id=$2 FOR UPDATE",[order,buyer]);
  if(parent.rows.length!==1)throw new CancelError("ORDER_NOT_FOUND");
  if(parent.rows[0].state==="cancelled"){
   await db.query("COMMIT");started=false;
   return {orderId:order,replayed:true,restoredLines:0,testOnly:true};
  }
  if(parent.rows[0].state!=="draft")throw new CancelError("CANNOT_CANCEL_CONFIRMED_ORDER");
  const children=await db.query("SELECT id,seller_id,state FROM borvat.seller_orders WHERE buyer_order_id=$1 ORDER BY id FOR UPDATE",[order]);
  if(!children.rows.length)throw new CancelError("MISSING_SELLER_ORDERS");
  if(children.rows.some(c=>c.state!=="created"))throw new CancelError("SELLER_ORDER_NOT_CANCELLABLE");
  const lines=await db.query("SELECT l.id,l.offer_id,l.quantity,so.seller_id FROM borvat.order_lines l JOIN borvat.seller_orders so ON so.id=l.seller_order_id WHERE so.buyer_order_id=$1 ORDER BY l.offer_id,l.id FOR UPDATE OF l",[order]);
  if(!lines.rows.length)throw new CancelError("MISSING_ORDER_LINES");
  const childrenSet=new Set(children.rows.map(c=>c.seller_id.toLowerCase()));
  if(lines.rows.some(l=>!uuid(l.offer_id)||!uuid(l.seller_id)||!childrenSet.has(l.seller_id.toLowerCase())||!Number.isSafeInteger(Number(l.quantity))||Number(l.quantity)<1))throw new CancelError("INVALID_ORDER_LINES");
  // Lock relevant inventory rows in a stable order. Prevent deletion or seller re-assignment.
  const ids=[...new Set(lines.rows.map(l=>l.offer_id.toLowerCase()))].sort();
  const inventory=await db.query("SELECT id,seller_id,stock FROM borvat.offers WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[ids]);
  if(inventory.rows.length!==ids.length)throw new CancelError("OFFER_MISSING");
  const byId=new Map(inventory.rows.map(o=>[o.id.toLowerCase(),o]));
  const restock=new Map();
  for(const line of lines.rows){
   const key=line.offer_id.toLowerCase(),o=byId.get(key);
   if(!o||o.seller_id.toLowerCase()!==line.seller_id.toLowerCase())throw new CancelError("SELLER_MISMATCH");
   restock.set(key,(restock.get(key)||0)+Number(line.quantity));
  }
  for(const key of ids){
   const units=restock.get(key);
   if(!Number.isSafeInteger(units)||units<1||!Number.isSafeInteger(Number(byId.get(key).stock))||Number(byId.get(key).stock)+units>2147483647)throw new CancelError("STOCK_OVERFLOW");
   const result=await db.query("UPDATE borvat.offers SET stock=stock+$2,updated_at=now() WHERE id=$1 AND seller_id=$3 AND stock <= 2147483647-$2",[key,units,byId.get(key).seller_id]);
   if(result.rowCount!==1)throw new CancelError("STOCK_CHANGED");
  }
  const sub=await db.query("UPDATE borvat.seller_orders SET state='cancelled' WHERE buyer_order_id=$1 AND state='created'",[order]);
  if(sub.rowCount!==children.rows.length)throw new CancelError("SELLER_ORDER_CHANGED");
  const parentUpdated=await db.query("UPDATE borvat.buyer_orders SET state='cancelled' WHERE id=$1 AND buyer_id=$2 AND state='draft'",[order,buyer]);
  if(parentUpdated.rowCount!==1)throw new CancelError("ORDER_CHANGED");
  await db.query("INSERT INTO borvat.outbox_events(id,event_type,aggregate_id,payload) VALUES($1,'demo_order.cancelled',$2,$3::jsonb)",[randomUUID(),order,JSON.stringify({buyerId:buyer,restoredLines:lines.length,restoredUnits:[...restock.values()].reduce((a,b)=>a+b,0),paymentEnabled:false})]);
  await db.query("COMMIT");started=false;
  return {orderId:order,replayed:false,restoredLines:lines.length,testOnly:true};
 }catch(error){
  if(started){try{await db.query("ROLLBACK")}catch(rollbackError){if(error&&typeof error==="object")error.rollbackError=rollbackError}}
  throw error;
 }finally{db.release()}
}
