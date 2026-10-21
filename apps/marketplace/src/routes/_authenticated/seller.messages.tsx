import { createFileRoute } from "@tanstack/react-router";
import { ManagerShell, SELLER_NAV } from "@/components/demo/shell";
import { ChannelInbox } from "@/components/demo/inbox";

export const Route = createFileRoute("/_authenticated/seller/messages")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Messages with Borvat — Seller Manager" },
      { name: "description", content: "Three-pane merchant inbox for conversations between your shop and Borvat." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Messages with Borvat — Seller Manager" },
      { property: "og:description", content: "Merchant \u2194 Borvat conversations." },
    ],
  }),
  component: SellerMessages,
});

function SellerMessages() {
  return (
    <ManagerShell
      navTitle="Seller Manager"
      nav={SELLER_NAV}
      title="Messages with Borvat"
      subtitle="You only talk to Borvat. Customer conversations are handled by Borvat support."
    >
      <ChannelInbox
        channel="borvat_merchant"
        emptyHint="No conversations match this filter."
        composerHint="Reply to Borvat support\u2026"
        viewer="merchant"
      />
    </ManagerShell>
  );
}
