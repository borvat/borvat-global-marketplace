import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { BuyerJourney } from "./buyer-journey";
import {
  createCommercialDemoAdapter,
  type CommercialDemoAdapter,
} from "../../lib/commercial/demo-adapter";
import { createTanStackBuyerNavigation } from "../../lib/commercial/tanstack-navigation";
import { browserTestStorage } from "../../lib/commercial/test-storage";

const ApplicationContext = createContext<CommercialDemoAdapter | null>(null);
let browserTabAdapter: CommercialDemoAdapter | undefined;

function createIsolatedAdapter() {
  // Keep demo state through SPA route remounts in one tab. A document reload creates a new
  // JavaScript context, and server rendering always gets an isolated request-scoped adapter.
  if (typeof window === "undefined") return createCommercialDemoAdapter();
  browserTabAdapter ??= createCommercialDemoAdapter();
  return browserTabAdapter;
}

/** One command store per browser tab or SSR request, never a server process singleton. */
export function IsolatedCommerceProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState(createIsolatedAdapter);
  // Cart and TEST- orders are restored after hydration so SSR markup never depends on browser storage.
  useEffect(() => {
    adapter.restore(browserTestStorage());
  }, [adapter]);
  return <ApplicationContext.Provider value={adapter}>{children}</ApplicationContext.Provider>;
}

export function IsolatedBuyerApplication() {
  const adapter = useContext(ApplicationContext);
  const router = useRouter();
  const [navigation] = useState(() => createTanStackBuyerNavigation(router));
  if (!adapter) throw new Error("Isolated commerce provider is missing.");
  return <BuyerJourney adapter={adapter} navigation={navigation} manageDocument={false} />;
}
