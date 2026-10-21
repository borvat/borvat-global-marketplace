import { createFileRoute } from "@tanstack/react-router";
import { SellerApplicationsPanel } from "@/components/review/seller-applications-panel";

export const Route = createFileRoute("/_authenticated/admin/seller-applications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seller applications — Borvat Admin" },
      {
        name: "description",
        content: "Review, approve, reject or suspend Borvat seller verification applications.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Seller applications — Borvat Admin" },
      { property: "og:description", content: "Seller verification review queue." },
    ],
  }),
  component: SellerApplicationsPanel,
});
