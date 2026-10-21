import { createFileRoute } from "@tanstack/react-router";
import { SellerApplicationsPanel } from "@/components/review/seller-applications-panel";

export const Route = createFileRoute("/_authenticated/review/seller-applications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seller applications — Borvat Verification" },
      {
        name: "description",
        content: "Independent review of Borvat seller verification applications.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Seller applications — Borvat Verification" },
      { property: "og:description", content: "Independent verification review queue." },
    ],
  }),
  component: SellerApplicationsPanel,
});
