// Isolated test host, not TanStack or the original application. No backend.
import React from "react";
import { createRoot } from "react-dom/client";
import { BuyerJourney } from "../../apps/marketplace/src/components/commercial/buyer-journey";
import { createCommercialDemoAdapter } from "../../apps/marketplace/src/lib/commercial/demo-adapter";
import { createHostBuyerNavigation } from "../../apps/marketplace/src/lib/commercial/buyer-navigation";
import {
  readDemoCatalog,
  type Catalog,
  type CatalogReader,
} from "../../apps/marketplace/src/lib/commercial/buyer-discovery";
import "../../apps/marketplace/src/styles.css";
const scenario = new URLSearchParams(location.search).get("case");
const adapter = createCommercialDemoAdapter();
adapter.setQuantity("demo-offer-1", 1);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
window.history.replaceState(
  { isolatedHost: true },
  "",
  "/product/prd_001?offer=demo-offer-1&country=BE&q=tafel",
);
window.addEventListener("popstate", emit);
const navigation = createHostBuyerNavigation({
  initialLocation: location.pathname + location.search,
  getLocation: () => location.pathname + location.search,
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  navigate(href, { replace }) {
    history[replace ? "replaceState" : "pushState"](
      { isolatedHost: true },
      "",
      href,
    );
    emit();
  },
});
const pending: (() => void)[] = [];
let attempts = 0;
const reader: CatalogReader = (snapshot, signal) => {
  if (scenario === "sync-error") {
    if (attempts++ < 2) throw new Error("Synchronous synthetic reader failure");
    return readDemoCatalog(snapshot, signal);
  }
  // Deliberately ignore abort and resolve captured snapshots out of order.
  return new Promise<Catalog>((resolve) =>
    pending.push(() =>
      resolve({ products: snapshot.products, offers: snapshot.offers }),
    ),
  );
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <aside aria-label="Isolated test controls">
      <button onClick={() => adapter.setOfferPrice("demo-offer-1", 12345)}>
        Fixture: draft offer
      </button>
      <button onClick={() => pending.pop()?.()}>Fixture: resolve newest</button>
      <button
        onClick={() => {
          pending.splice(0).forEach((resolve) => resolve());
        }}
      >
        Fixture: resolve older
      </button>
    </aside>
    <BuyerJourney
      adapter={adapter}
      navigation={navigation}
      readCatalog={reader}
    />
  </React.StrictMode>,
);
