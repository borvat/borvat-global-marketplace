// Stable hashing of JSON snapshots even after PostgreSQL jsonb reorders object keys.
// TEST ONLY. SHA-256 detects accidental tampering, not forgery by a privileged writer.
import {createHash} from "node:crypto";
export function canonicalSnapshot(value){
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"){if(!Number.isSafeInteger(value))throw new Error("INVALID_SNAPSHOT_NUMBER");return JSON.stringify(value)}
 if(Array.isArray(value))return "["+value.map(canonicalSnapshot).join(",")+"]";
 if(value&&typeof value==="object"){
  const keys=Object.keys(value).sort();
  return "{"+keys.map(k=>JSON.stringify(k)+":"+canonicalSnapshot(value[k])).join(",")+"}";
 }
 throw new Error("INVALID_SNAPSHOT_VALUE");
}
export function snapshotDigest(value){return createHash("sha256").update(canonicalSnapshot(value)).digest("hex")}
