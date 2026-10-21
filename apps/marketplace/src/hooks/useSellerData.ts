import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* M1V-1A — Seller Manager live READ-ONLY data access                  */
/* Every read goes through a security-definer, membership-scoped RPC.  */
/* No writes, no direct table access, no Bol sync.                     */
/* ------------------------------------------------------------------ */

export type SellerWorkspace = {
  company_id: string;
  company_name: string;
  store_id: string | null;
  store_slug: string | null;
  store_name: string | null;
  store_status: string | null;
};

export type SellerOverview = {
  active_listings: number;
  draft_listings: number;
  products_no_stock: number;
  low_stock_items: number;
  total_available: number;
  total_reserved: number;
  fulfillment_origins: number;
  action_required: number;
  live_channels: number;
};

export type SellerCatalogRow = {
  sku_id: string;
  product_id: string;
  title: string | null;
  brand: string | null;
  sku_code: string | null;
  product_status: string | null;
  sku_status: string | null;
  price_minor: number | null;
  currency_code: string | null;
  available: number | null;
  reserved: number | null;
  delivery_promise: string | null;
  fulfillment_origin: string | null;
  publication_status: string | null;
  tax_classification: string | null;
  action_reason: string | null;
};

export type SellerInventoryRow = {
  sku_id: string;
  sku_code: string | null;
  title: string | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  location_code: string | null;
  on_hand: number | null;
  reserved: number | null;
  available: number | null;
  published_quantity: number | null;
  last_movement_at: string | null;
};

export type SellerStoreProfile = {
  store_id: string;
  company_id: string;
  company_name: string | null;
  slug: string | null;
  display_name: string | null;
  description: string | null;
  status: string | null;
  is_primary: boolean | null;
  default_locale: string | null;
  default_currency: string | null;
  country_code: string | null;
  logo_url: string | null;
  banner_url: string | null;
  sales_terms_url: string | null;
  returns_policy_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const ACTIVE_KEY = "borvat.seller.activeWorkspace";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export function useSellerWorkspaces() {
  return useQuery({
    queryKey: ["seller", "workspaces"],
    queryFn: () => rpc<SellerWorkspace>("seller_list_workspaces"),
    staleTime: 60_000,
  });
}

/** Resolves the active company/store from localStorage, falling back to the first authorised workspace. */
export function useActiveSellerWorkspace() {
  const workspaces = useSellerWorkspaces();
  const [storedKey, setStoredKey] = useState<string | null>(null);

  useEffect(() => {
    setStoredKey(window.localStorage.getItem(ACTIVE_KEY));
  }, []);

  const list = workspaces.data ?? [];
  const active =
    list.find((w) => `${w.company_id}:${w.store_id ?? ""}` === storedKey) ?? list[0] ?? null;

  const select = useCallback((w: SellerWorkspace) => {
    const key = `${w.company_id}:${w.store_id ?? ""}`;
    window.localStorage.setItem(ACTIVE_KEY, key);
    setStoredKey(key);
  }, []);

  return {
    workspaces: list,
    active,
    select,
    isLoading: workspaces.isLoading,
    error: workspaces.error as Error | null,
  };
}

export function useSellerOverview(companyId?: string | null, storeId?: string | null) {
  return useQuery({
    queryKey: ["seller", "overview", companyId, storeId],
    enabled: Boolean(companyId),
    queryFn: async () =>
      (
        await rpc<SellerOverview>("seller_store_overview", {
          p_company_id: companyId,
          p_store_id: storeId ?? null,
        })
      )[0] ?? null,
  });
}

export function useSellerCatalog(
  companyId?: string | null,
  storeId?: string | null,
  limit = 200,
  offset = 0,
) {
  return useQuery({
    queryKey: ["seller", "catalog", companyId, storeId, limit, offset],
    enabled: Boolean(companyId),
    queryFn: () =>
      rpc<SellerCatalogRow>("seller_list_catalog", {
        p_company_id: companyId,
        p_store_id: storeId ?? null,
        p_limit: limit,
        p_offset: offset,
      }),
  });
}

export function useSellerInventory(
  companyId?: string | null,
  storeId?: string | null,
  limit = 200,
  offset = 0,
) {
  return useQuery({
    queryKey: ["seller", "inventory", companyId, storeId, limit, offset],
    enabled: Boolean(companyId),
    queryFn: () =>
      rpc<SellerInventoryRow>("seller_list_inventory", {
        p_company_id: companyId,
        p_store_id: storeId ?? null,
        p_limit: limit,
        p_offset: offset,
      }),
  });
}

export function useSellerStoreProfile(companyId?: string | null, storeId?: string | null) {
  return useQuery({
    queryKey: ["seller", "store-profile", companyId, storeId],
    enabled: Boolean(companyId) && Boolean(storeId),
    queryFn: async () =>
      (
        await rpc<SellerStoreProfile>("seller_get_store_profile", {
          p_company_id: companyId,
          p_store_id: storeId,
        })
      )[0] ?? null,
  });
}
