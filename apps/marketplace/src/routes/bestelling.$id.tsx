import { createFileRoute, notFound } from "@tanstack/react-router";
import { IsolatedBuyerApplication } from "../components/commercial/application-provider";
import { ISOLATED_COMMERCE } from "../lib/commercial/runtime-mode";

export const Route = createFileRoute("/bestelling/$id")({
  beforeLoad: () => {
    if (!ISOLATED_COMMERCE) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Testbestelling · BORVAT" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: IsolatedBuyerApplication,
});
