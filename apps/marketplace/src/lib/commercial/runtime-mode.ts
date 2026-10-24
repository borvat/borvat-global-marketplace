/** Explicit build-time isolation; never inferred from missing credentials or a URL. */
export const ISOLATED_COMMERCE = import.meta.env?.VITE_BORVAT_RUNTIME === "isolated";

export function isIsolatedCommercePath(pathname: string) {
  return (
    ["/", "/discover", "/cart", "/afrekenen", "/requests", "/workbench"].includes(pathname) ||
    /^\/product\/[^/]+$/.test(pathname) ||
    /^\/bestelling\/[^/]+$/.test(pathname)
  );
}

/** Applied before the framework dispatches any API/server-function handler. */
export function isolatedCommerceRequestStatus(method: string, pathname: string): 200 | 404 | 405 {
  if (method !== "GET" && method !== "HEAD") return 405;
  return isIsolatedCommercePath(pathname) ? 200 : 404;
}
