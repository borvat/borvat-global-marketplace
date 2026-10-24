import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { BuyerJourney } from "./buyer-journey";
import {
  createCommercialDemoAdapter,
  type CommercialDemoAdapter,
} from "../../lib/commercial/demo-adapter";
import { createTanStackBuyerNavigation } from "../../lib/commercial/tanstack-navigation";
import { browserTestStorage } from "../../lib/commercial/test-storage";
import { CONNECTED_TEST_COMMERCE } from "../../lib/commercial/runtime-mode";
import { createServerCommerceAdapter } from "../../lib/commercial/server-adapter";

const ApplicationContext = createContext<CommercialDemoAdapter | null>(null);
let browserTabAdapter: CommercialDemoAdapter | undefined;

function createIsolatedAdapter() {
  // Keep demo state through SPA route remounts in one tab. A document reload creates a new
  // JavaScript context, and server rendering always gets an isolated request-scoped adapter.
  const create = CONNECTED_TEST_COMMERCE
    ? createServerCommerceAdapter
    : createCommercialDemoAdapter;
  if (typeof window === "undefined") return create();
  browserTabAdapter ??= create();
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
