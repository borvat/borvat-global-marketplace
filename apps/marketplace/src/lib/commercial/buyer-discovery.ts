import type { DemoSnapshot, ProductSort } from "./demo-adapter";
import { buyerCatalog, rehearsalCatalog } from "./catalog-rehearsal";

export type BuyerCountry = "NL" | "BE";
export type Catalog = ReturnType<typeof buyerCatalog>;
// Read-only projection seam. The demo adapter remains the sole local command store.
export type CatalogReader = (snapshot: DemoSnapshot, signal: AbortSignal) => Promise<Catalog>;
export const readDemoCatalog: CatalogReader = async (snapshot, signal) => {
  signal.throwIfAborted();
  const catalog = buyerCatalog(rehearsalCatalog(snapshot));
  signal.throwIfAborted();
  return catalog;
};
export function buyerLocation(href: string) {
  const url = new URL(href, "http://127.0.0.1");
  const country: BuyerCountry = url.searchParams.get("country") === "BE" ? "BE" : "NL";
  const category = ["Wonen", "Tuin"].includes(url.searchParams.get("category") ?? "")
    ? url.searchParams.get("category")!
    : "Alles";
  let productId: string | null = null;
  let orderId: string | null = null;
  try {
    if (url.pathname.startsWith("/product/")) productId = decodeURIComponent(url.pathname.slice(9));
    if (url.pathname.startsWith("/bestelling/"))
      orderId = decodeURIComponent(url.pathname.slice(12));
  } catch {
    /* Malformed paths render the unknown-product state. */
  }
  const euros = (key: string) => {
    const raw = url.searchParams.get(key);
    return raw && /^\d{1,7}$/.test(raw) ? Number(raw) : null;
  };
  const sort = url.searchParams.get("sort");
  const language =
    url.searchParams.get("lang") === "ar"
      ? "ar"
      : url.searchParams.get("lang") === "en"
        ? "en"
        : "nl";
  return {
    path: url.pathname,
    productId,
    country,
    language,
    locale:
      language === "ar"
        ? "ar-NL"
        : language === "en"
          ? "en-NL"
          : country === "BE"
            ? "nl-BE"
            : "nl-NL",
    query: url.searchParams.get("q") ?? "",
    category,
    sort: (sort === "price" || sort === "price-desc" ? sort : "title") as ProductSort,
    minPrice: euros("min"),
    maxPrice: euros("max"),
    inStock: url.searchParams.get("stock") === "1",
    orderId,
    simulateCatalogError: url.searchParams.get("testfout") === "catalogus",
    offerId: url.searchParams.get("offer"),
    skuId: url.searchParams.get("sku"),
  };
}
export function buyerHref(
  path: string,
  current: string,
  changes: Record<string, string | null> = {},
) {
  const url = new URL(current, "http://127.0.0.1");
  url.pathname = path;
  url.hash = "";
  if (!path.startsWith("/product/")) {
    url.searchParams.delete("offer");
    url.searchParams.delete("sku");
  }
  for (const [key, value] of Object.entries(changes)) {
    if (!value) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}
