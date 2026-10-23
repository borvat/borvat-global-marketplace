import type { DemoSnapshot } from "./demo-adapter";
import { buyerCatalog, rehearsalCatalog } from "./catalog-rehearsal";

export type BuyerCountry = "NL" | "BE";
export type Catalog = Pick<DemoSnapshot, "products" | "offers">;
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
  try {
    if (url.pathname.startsWith("/product/")) productId = decodeURIComponent(url.pathname.slice(9));
  } catch {
    /* Malformed paths render the unknown-product state. */
  }
  return {
    path: url.pathname,
    productId,
    country,
    locale: country === "BE" ? "nl-BE" : "nl-NL",
    query: url.searchParams.get("q") ?? "",
    category,
    sort: url.searchParams.get("sort") === "price" ? ("price" as const) : ("title" as const),
    offerId: url.searchParams.get("offer"),
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
  if (!path.startsWith("/product/")) url.searchParams.delete("offer");
  for (const [key, value] of Object.entries(changes)) {
    if (!value) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}
