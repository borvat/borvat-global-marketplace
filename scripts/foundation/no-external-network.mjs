// Test harness guard only. This is not a security sandbox for hostile code.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const allowed=host=>['localhost','127.0.0.1','::1','[::1]'].includes(host);
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const first=args[0];const opt=Array.isArray(first)?first[0]:first;
 const host=typeof opt==='object'?opt.host:typeof args[1]==='string'?args[1]:'localhost';
 if(!allowed(host??'localhost'))throw Error('EXTERNAL_NETWORK_DENIED');
 return originalConnect.apply(this,args);
};
for(const protocol of [http,https])for(const method of ['request','get']) {
 const original=protocol[method];protocol[method]=function(input,...args){
  const host=typeof input==='string'||input instanceof URL?new URL(input).hostname:input?.hostname??input?.host??'localhost';
  if(!allowed(host))throw Error('EXTERNAL_NETWORK_DENIED');return original.call(this,input,...args);
 };
}
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,...args)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(!allowed(url.hostname))throw Error('EXTERNAL_NETWORK_DENIED');return originalFetch(input,...args);
};
for(const [key,value] of Object.entries(process.env)) {
 if(/^(?:SUPABASE|ADMIN_DATABASE|APP_DATABASE|DATABASE)_URL$/.test(key)&&value&&!allowed(new URL(value).hostname))throw Error('REMOTE_DATABASE_ENV_DENIED:'+key);
 if(/^(?:STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|BOL_CLIENT_SECRET|SMTP_PASSWORD)$/.test(key)&&value)throw Error('PRIVILEGED_ENV_DENIED:'+key);
}
