import React from "react";
import { createRoot } from "react-dom/client";
import { BuyerJourney } from "../../apps/marketplace/src/components/commercial/buyer-journey";
import { createCommercialDemoAdapter } from "../../apps/marketplace/src/lib/commercial/demo-adapter";
import "../../apps/marketplace/src/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Preview root missing");
createRoot(root).render(
  <React.StrictMode>
    <BuyerJourney adapter={createCommercialDemoAdapter()} />
  </React.StrictMode>,
);
