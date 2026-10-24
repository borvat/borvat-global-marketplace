/** Delivers synthetic original templates to an already running loopback Mailpit only. */
import assert from 'node:assert/strict';
import React from 'react';
import { render } from '@react-email/render';
import { spawnSync } from 'node:child_process';
import { template as processing } from '../../apps/marketplace/src/lib/email-templates/order-processing';
import { template as shipped } from '../../apps/marketplace/src/lib/email-templates/order-shipped';
import { template as delivered } from '../../apps/marketplace/src/lib/email-templates/order-delivered';
import { SignupEmail } from '../../apps/marketplace/src/lib/email-templates/signup';
import { InviteEmail } from '../../apps/marketplace/src/lib/email-templates/invite';
import { MagicLinkEmail } from '../../apps/marketplace/src/lib/email-templates/magic-link';
import { RecoveryEmail } from '../../apps/marketplace/src/lib/email-templates/recovery';
import { EmailChangeEmail } from '../../apps/marketplace/src/lib/email-templates/email-change';
import { ReauthenticationEmail } from '../../apps/marketplace/src/lib/email-templates/reauthentication';
const p={siteName:'Synthetic BORVAT',siteUrl:'https://example.test',confirmationUrl:'https://example.test/confirm',
  recipient:'buyer@example.test',oldEmail:'old@example.test',email:'buyer@example.test',newEmail:'new@example.test',token:'123456'};
const cases=[
  ...[processing,shipped,delivered].map((template,index)=>({name:['processing','shipped','delivered'][index],
    node:React.createElement(template.component as unknown as React.ComponentType<Record<string, unknown>>,{...template.previewData,siteUrl:p.siteUrl})})),
  ...[SignupEmail,InviteEmail,MagicLinkEmail,RecoveryEmail,EmailChangeEmail,ReauthenticationEmail].map((component,index)=>({
    name:['signup','invite','magic-link','recovery','email-change','reauthentication'][index],node:React.createElement(component,p)})),
];
const api='http://127.0.0.1:18025';
const initial=await fetch(api+'/api/v1/messages').then(r=>r.json());
assert.equal(initial.total,0,'Use a fresh disposable mailbox; never delete or reuse user mail');
const messages=[];
for(const item of cases) messages.push({name:item.name,html:await render(item.node),text:await render(item.node,{plainText:true})});
const sent=spawnSync('python3',['-c',`
import json,sys,smtplib
from email.message import EmailMessage
messages=json.load(sys.stdin)
with smtplib.SMTP('127.0.0.1',11025,timeout=10) as smtp:
 for item in messages:
  mail=EmailMessage()
  mail['From']='BORVAT Test <sender@example.test>'
  mail['To']='buyer@example.test'
  mail['Subject']='BORVAT mailbox verification: '+item['name']
  mail.set_content(item['text'])
  mail.add_alternative(item['html'],subtype='html')
  smtp.send_message(mail)
print(len(messages))
`],{input:JSON.stringify(messages),encoding:'utf8'});
assert.equal(sent.status,0,sent.stderr);
const list=await fetch(api+'/api/v1/messages').then(r=>r.json());
assert.equal(list.total,9);assert.equal(list.messages.length,9);
for(const row of list.messages) {
  assert.equal(row.To.length,1);assert.equal(row.To[0].Address,'buyer@example.test');
  const detail=await fetch(api+'/api/v1/message/'+encodeURIComponent(row.ID)).then(r=>r.json());
  assert.match(detail.HTML,/<html/);assert.ok(detail.Text.length>20);
}
console.log(JSON.stringify({status:'PASS',messages:9,transport:'SMTP 127.0.0.1:11025',readback:'Mailpit HTTP 127.0.0.1:18025',
  realDelivery:false,originalMediaVerified:false,scope:'original templates, synthetic fixtures, disposable local mailbox; no production email adapter'}));
