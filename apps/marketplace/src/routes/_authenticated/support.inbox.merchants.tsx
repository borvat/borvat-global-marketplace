import { createFileRoute } from "@tanstack/react-router";
import { ManagerShell, SUPPORT_NAV } from "@/components/demo/shell";
import { ChannelInbox } from "@/components/demo/inbox";

export const Route = createFileRoute("/_authenticated/support/inbox/merchants")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Merchant inbox (demo) — Borvat Customer Service" },
      { name: "description", content: "Demo Borvat ↔ merchant conversations for support staff." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Merchant inbox (demo) — Borvat" },
      { property: "og:description", content: "Demo merchant support inbox." },
    ],
  }),
  component: MerchantInbox,
});

function MerchantInbox() {
  return (
    <ManagerShell
      navTitle="Customer Service"
      nav={SUPPORT_NAV}
      title="Seller inbox"
      subtitle="Borvat ↔ Seller only. This channel is never shown to customers."
    >
      <ChannelInbox
        channel="borvat_merchant"
        emptyHint="No seller conversations match this filter."
        composerHint="Message the seller — never visible to the customer…"
      />
    </ManagerShell>
  );
}
