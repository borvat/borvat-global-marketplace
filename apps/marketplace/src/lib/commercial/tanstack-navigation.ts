import type { AnyRouter } from "@tanstack/react-router";
import { createHostBuyerNavigation } from "./buyer-navigation";

/** The actual application router is the only history writer, including search replacement. */
export function createTanStackBuyerNavigation(router: AnyRouter) {
  const location = () => router.state.location.href;
  return createHostBuyerNavigation({
    initialLocation: location(),
    getLocation: location,
    subscribe: (listener) => router.subscribe("onResolved", listener),
    navigate(href, { replace }) {
      // Buyer links are local app URLs. Never let an injected catalog request a document escape.
      if (!href.startsWith("/") || new URL(href, "http://127.0.0.1").origin !== "http://127.0.0.1")
        throw new Error("Only local buyer navigation is supported.");
      void router.navigate({ href, replace });
    },
  });
}
