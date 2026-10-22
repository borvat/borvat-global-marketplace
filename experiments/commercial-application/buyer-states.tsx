// Browser-test entry only. No backend, credentials or production adapter.
import React from "react";
import { createRoot } from "react-dom/client";
import { BuyerJourney } from "../../apps/marketplace/src/components/commercial/buyer-journey";
import { createCommercialDemoAdapter } from "../../apps/marketplace/src/lib/commercial/demo-adapter";
import {
  readDemoCatalog,
  type CatalogReader,
} from "../../apps/marketplace/src/lib/commercial/buyer-discovery";
import "../../apps/marketplace/src/styles.css";
const scenario = new URLSearchParams(location.search).get("case");
let attempts = 0;
const reader: CatalogReader = async (snapshot, signal) => {
  await new Promise((resolve) =>
    setTimeout(resolve, scenario === "loading" ? 1500 : 20),
  );
  if (signal.aborted) throw new Error("Aborted isolated fixture");
  if (scenario === "error" && attempts++ === 0)
    throw new Error("Synthetic read failure");
  if (scenario === "empty") return { products: [], offers: [] };
  return readDemoCatalog(snapshot, signal);
};
window.history.replaceState(null, "", "/discover");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BuyerJourney
      adapter={createCommercialDemoAdapter()}
      readCatalog={reader}
    />
  </React.StrictMode>,
);
