import { useShopCopy } from "./i18n";
import { createContext, useContext, type MouseEvent, type ReactNode } from "react";
import {
  browserBuyerNavigation,
  type BuyerNavigation,
} from "../../../lib/commercial/buyer-navigation";
import type { buyerLocation, Catalog } from "../../../lib/commercial/buyer-discovery";
import type { CommercialDemoAdapter, DemoSnapshot } from "../../../lib/commercial/demo-adapter";

export const NavigationContext = createContext<BuyerNavigation>(browserBuyerNavigation);

export type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; catalog: Catalog };
export type ShopValue = {
  adapter: CommercialDemoAdapter;
  snapshot: DemoSnapshot;
  catalog: Catalog;
  load: LoadState;
  retry: () => void;
  route: ReturnType<typeof buyerLocation>;
  link: (path: string, changes?: Record<string, string | null>) => string;
  navigate: (href: string, replace?: boolean) => void;
};
export const ShopContext = createContext<ShopValue | null>(null);
export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("Shop context is missing.");
  return value;
}

export function LocalLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
}) {
  const copy = useShopCopy();
  const { navigate } = useContext(NavigationContext);
  return (
    <a
      {...rest}
      href={href}
      className={
        className ??
        "underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
      }
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

export type CatalogOffer = Catalog["offers"][number];
export function publishedOffers(catalog: Catalog, productId: string) {
  return catalog.offers.filter((o) => o.productId === productId && o.state === "published");
}
export function productAvailability(catalog: Catalog, productId: string) {
  return Math.max(0, ...publishedOffers(catalog, productId).map((o) => o.availabilityExample));
}
export function fromPrice(catalog: Catalog, productId: string) {
  return Math.min(...publishedOffers(catalog, productId).map((o) => o.priceCents));
}
