import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CommercialDemoAdapter } from "../../lib/commercial/demo-adapter";
import {
  buyerHref,
  buyerLocation,
  readDemoCatalog,
  type CatalogReader,
} from "../../lib/commercial/buyer-discovery";
import {
  browserBuyerNavigation,
  type BuyerNavigation,
} from "../../lib/commercial/buyer-navigation";
import { CommercialWorkspace } from "./workspace";
import {
  LocalLink,
  NavigationContext,
  ShopContext,
  type LoadState,
  type ShopValue,
} from "./shop/shop-context";
import { ShopFooter, ShopHeader } from "./shop/shop-header";
import { DiscoveryView } from "./shop/discovery-view";
import { ProductView } from "./shop/product-view";
import { CartView } from "./shop/cart-view";
import { CheckoutView } from "./shop/checkout-view";
import { ConfirmationView, OrdersView } from "./shop/order-views";
import { nl } from "./shop/nl";

type BuyerJourneyProps = {
  adapter: CommercialDemoAdapter;
  readCatalog?: CatalogReader;
  navigation?: BuyerNavigation;
  manageDocument?: boolean;
};
const failingReader: CatalogReader = () => Promise.reject(new Error("Simulated catalog error"));

export function BuyerJourney({ navigation = browserBuyerNavigation, ...props }: BuyerJourneyProps) {
  return (
    <NavigationContext.Provider value={navigation}>
      <BuyerJourneyView navigation={navigation} {...props} />
    </NavigationContext.Provider>
  );
}

function pageTitle(path: string) {
  if (path.startsWith("/product/")) return "Product";
  if (path === "/cart") return nl.cart;
  if (path === "/afrekenen") return nl.checkoutTitle;
  if (path.startsWith("/bestelling/")) return "Bestelling";
  if (path === "/requests") return nl.orders;
  return "Ontdek onze collectie";
}

function ShopRoute({ path }: { path: string }) {
  if (path === "/" || path === "/discover") return <DiscoveryView />;
  if (path.startsWith("/product/")) return <ProductView />;
  if (path === "/cart") return <CartView />;
  if (path === "/afrekenen") return <CheckoutView />;
  if (path.startsWith("/bestelling/")) return <ConfirmationView />;
  if (path === "/requests") return <OrdersView />;
  return (
    <h1 tabIndex={-1} className="text-2xl font-bold">
      {nl.pageNotFound}
    </h1>
  );
}

function BuyerJourneyView({
  adapter,
  navigation = browserBuyerNavigation,
  readCatalog = readDemoCatalog,
  manageDocument = true,
}: BuyerJourneyProps) {
  const href = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getServerSnapshot,
  );
  const route = buyerLocation(href);
  const snapshot = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reader = route.simulateCatalogError && attempt === 0 ? failingReader : readCatalog;
  useEffect(() => {
    const controller = new AbortController();
    setLoad((previous) => (previous.status === "ready" ? previous : { status: "loading" }));
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new Error("Catalog read cancelled");
        return reader(snapshot, controller.signal);
      })
      .then((catalog) => {
        if (!controller.signal.aborted) setLoad({ status: "ready", catalog });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
  }, [snapshot, reader, attempt]);
  const firstPath = useRef(true);
  useEffect(() => {
    // Move focus to the new page heading on client-side navigation only, not on first load.
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    document.querySelector<HTMLElement>("#buyer-main h1")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [route.path]);
  useEffect(() => {
    if (!manageDocument) return;
    document.title = `${pageTitle(route.path)} · BORVAT`;
    document.documentElement.lang = route.locale;
  }, [route.path, route.locale, manageDocument]);
  const link = (path: string, changes: Record<string, string | null> = {}) =>
    buyerHref(path, href, changes);
  if (route.path === "/workbench")
    return (
      <>
        <CommercialWorkspace adapter={adapter} />
        <div className="mx-auto max-w-7xl px-5 pb-8">
          <LocalLink href={link("/discover")}>Terug naar ontdekken</LocalLink>
        </div>
      </>
    );
  const value: ShopValue = {
    adapter,
    snapshot,
    catalog: load.status === "ready" ? load.catalog : { products: [], offers: [], skus: [] },
    load,
    retry: () => setAttempt((n) => n + 1),
    route,
    link,
    navigate: navigation.navigate,
  };
  return (
    <ShopContext.Provider value={value}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <a
          href="#buyer-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-background focus:p-3"
        >
          {nl.skipLink}
        </a>
        <div
          data-testid="test-environment-banner"
          className="bg-accent px-4 py-1.5 text-center text-xs font-semibold text-accent-foreground sm:text-sm"
        >
          {nl.testBanner}
        </div>
        <ShopHeader />
        <main
          id="buyer-main"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 [&_h1:focus]:outline-none"
        >
          {snapshot.storageStatus === "unavailable" && (
            <p role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-sm">
              Browseropslag is niet beschikbaar of opslaan is mislukt. Nieuwe testbestellingen
              worden niet bevestigd.
            </p>
          )}
          <ShopRoute path={route.path} />
        </main>
        <ShopFooter />
      </div>
    </ShopContext.Provider>
  );
}
