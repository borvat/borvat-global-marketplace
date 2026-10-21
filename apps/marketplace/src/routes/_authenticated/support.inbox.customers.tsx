import { createFileRoute } from "@tanstack/react-router";
import { ManagerShell, SUPPORT_NAV } from "@/components/demo/shell";
import { ChannelInbox } from "@/components/demo/inbox";

export const Route = createFileRoute("/_authenticated/support/inbox/customers")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Customer inbox (demo) — Borvat Customer Service" },
      { name: "description", content: "Demo customer ↔ Borvat conversations for support staff." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Customer inbox (demo) — Borvat" },
      { property: "og:description", content: "Demo customer support inbox." },
    ],
  }),
  component: CustomerInbox,
});

function CustomerInbox() {
  return (
    <ManagerShell
      navTitle="Customer Service"
      nav={SUPPORT_NAV}
      title="Customer inbox"
      subtitle="Customer ↔ Borvat only. Customers never message sellers directly."
    >
      <ChannelInbox
        channel="customer_borvat"
        emptyHint="No customer conversations match this filter."
        composerHint="Reply to the customer as Borvat…"
      />
    </ManagerShell>
  );
}
