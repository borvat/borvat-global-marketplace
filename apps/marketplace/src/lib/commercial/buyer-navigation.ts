/** A host owns its router/history. The buyer view consumes location and requests navigation. */
export interface BuyerNavigation {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  getServerSnapshot: () => string;
  navigate: (href: string, replace?: boolean) => void;
}
export function createHostBuyerNavigation(host: {
  subscribe: BuyerNavigation["subscribe"];
  getLocation: () => string;
  initialLocation: string;
  navigate: (href: string, options: { replace: boolean }) => void;
}): BuyerNavigation {
  return {
    subscribe: host.subscribe,
    getSnapshot: host.getLocation,
    getServerSnapshot: () => host.initialLocation,
    navigate(href, replace = false) {
      if (href !== host.getLocation()) host.navigate(href, { replace });
    },
  };
}
// Standalone preview implementation only. No window access occurs at module import.
export const browserBuyerNavigation = createHostBuyerNavigation({
  initialLocation: "/discover",
  getLocation: () => window.location.pathname + window.location.search,
  subscribe(listener) {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  },
  navigate(href, { replace }) {
    window.history[replace ? "replaceState" : "pushState"](null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  },
});
