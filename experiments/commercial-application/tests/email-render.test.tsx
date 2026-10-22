import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "@react-email/render";
import { template as processing } from "../../../apps/marketplace/src/lib/email-templates/order-processing";
import { template as shipped } from "../../../apps/marketplace/src/lib/email-templates/order-shipped";
import { template as delivered } from "../../../apps/marketplace/src/lib/email-templates/order-delivered";
import { SignupEmail } from "../../../apps/marketplace/src/lib/email-templates/signup";
import { InviteEmail } from "../../../apps/marketplace/src/lib/email-templates/invite";
import { MagicLinkEmail } from "../../../apps/marketplace/src/lib/email-templates/magic-link";
import { RecoveryEmail } from "../../../apps/marketplace/src/lib/email-templates/recovery";
import { EmailChangeEmail } from "../../../apps/marketplace/src/lib/email-templates/email-change";
import { ReauthenticationEmail } from "../../../apps/marketplace/src/lib/email-templates/reauthentication";
// Render original components only. No send adapter, webhook or email API imported.
function orderCase<P extends { siteUrl: string }>(
  name: string,
  component: React.ComponentType<P>,
  preview: P,
  subject: string | ((props: P) => string),
) {
  return {
    name,
    element: React.createElement(component, {
      ...preview,
      siteUrl: "https://example.test",
    }),
    subject: typeof subject === "function" ? subject(preview) : subject,
  };
}
const orders = [
  orderCase(
    "processing",
    processing.component,
    processing.previewData,
    processing.subject,
  ),
  orderCase("shipped", shipped.component, shipped.previewData, shipped.subject),
  orderCase(
    "delivered",
    delivered.component,
    delivered.previewData,
    delivered.subject,
  ),
];
for (const sample of orders) {
  test(`original ${sample.name} template renders HTML and text from synthetic preview fixture`, async () => {
    const html = await render(sample.element);
    const text = await render(sample.element, { plainText: true });
    assert.match(html, /<html/);
    assert.ok(text.length > 50);
    assert.ok(sample.subject.length > 5);
  });
}
const props = {
  siteName: "Synthetic BORVAT",
  siteUrl: "https://example.test",
  confirmationUrl: "https://example.test/confirm",
  recipient: "buyer@example.test",
  oldEmail: "old@example.test",
  email: "buyer@example.test",
  newEmail: "new@example.test",
  token: "123456",
};
const auth = [
  { name: "signup", element: <SignupEmail {...props} /> },
  { name: "invite", element: <InviteEmail {...props} /> },
  { name: "magic link", element: <MagicLinkEmail {...props} /> },
  { name: "recovery", element: <RecoveryEmail {...props} /> },
  { name: "email change", element: <EmailChangeEmail {...props} /> },
  { name: "reauthentication", element: <ReauthenticationEmail {...props} /> },
];
for (const sample of auth) {
  test(`original ${sample.name} component renders a synthetic preview without delivery`, async () => {
    const html = await render(sample.element);
    assert.match(html, /<html/);
    assert.match(html, /Synthetic BORVAT/);
  });
}
