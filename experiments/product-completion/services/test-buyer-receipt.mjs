// Isolated TEST-only buyer receipt reader. Never connect this directly to browsers.
// Authorization is verified by the server and buyer ownership is enforced in SQL.
import {snapshotDigest} from "./test-snapshot-integrity.mjs";
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const amount=x=>{
 if(typeof x==="string"&&!/^(0|[1-9][0-9]*)$/.test(x))return null;
 const n=Number(x);return (typeof x==="string"||typeof x==="number")&&Number.isSafeInteger(n)&&n>=0?n:null;
};
export class ReceiptError extends Error{constructor(code){super(code);this.name="ReceiptError"}}
export async function readTestBuyerReceipt(pool,{buyerId,orderId},{authorizeBuyer}={}){
 if(typeof authorizeBuyer!=="function")throw new ReceiptError("AUTH_NOT_CONFIGURED");
 if(!uuid(buyerId)||!uuid(orderId))throw new ReceiptError("INVALID_REQUEST");
 const buyer=buyerId.toLowerCase(),order=orderId.toLowerCase();
 if(await authorizeBuyer(buyer)!==true)throw new ReceiptError("UNAUTHORIZED");
 const db=await pool.connect();
 try{
  const result=await db.query("SELECT bo.id,bo.state,bo.currency AS order_currency,bo.total_minor,qs.currency,qs.gross_minor,qs.net_minor,qs.vat_minor,qs.snapshot,qs.snapshot_sha256 FROM borvat.buyer_orders bo JOIN borvat.order_quote_snapshots qs ON qs.buyer_order_id=bo.id WHERE bo.id=$1 AND bo.buyer_id=$2",[order,buyer]);
  if(result.rows.length!==1)throw new ReceiptError("RECEIPT_NOT_FOUND");
  const row=result.rows[0],snapshot=typeof row.snapshot==="string"?JSON.parse(row.snapshot):row.snapshot;
  if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot)||snapshot.schemaVersion!==1||!Array.isArray(snapshot.sellers))throw new ReceiptError("INVALID_RECEIPT");
  const gross=amount(row.gross_minor),net=amount(row.net_minor),vat=amount(row.vat_minor),total=amount(row.total_minor);
  if(gross===null||net===null||vat===null||total===null||gross!==net+vat||gross!==total||row.currency!=="EUR"||row.order_currency!=="EUR"||snapshot.currency!=="EUR"||snapshot.grossMinor!==gross||snapshot.netMinor!==net||snapshot.vatMinor!==vat)throw new ReceiptError("RECEIPT_TOTAL_MISMATCH");
  if(snapshotDigest(snapshot)!==row.snapshot_sha256)throw new ReceiptError("RECEIPT_INTEGRITY_FAILURE");
  return {orderId:order,state:row.state,currency:"EUR",totalMinor:gross,quote:snapshot,testOnly:true,paymentEnabled:false};
 }finally{db.release()}
}
