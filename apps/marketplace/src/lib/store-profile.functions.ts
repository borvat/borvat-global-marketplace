import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type PublicStoreProfile = {
  public_slug: string;
  display_name: string;
  logo_url: string | null;
  cover_image_url: string | null;
  short_description: string | null;
  full_description: string | null;
  return_policy_summary: string | null;
  warranty_summary: string | null;
  customer_service_summary: string | null;
  seller_since: string | null;
  categories: string[];
  shipping_countries: string[];
  verified_seller: boolean;
  contact_channel: string;
};

/**
 * M1V-1C — public storefront read.
 * Returns a profile ONLY when the store is published AND the owning company
 * is an approved verified seller. Otherwise null ("Store coming soon").
 * The verified badge is derived server-side; it can never be forged client-side.
 */
export const getPublicStoreProfile = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({
    slug: String(data?.slug ?? "").toLowerCase().slice(0, 64),
  }))
  .handler(async ({ data }): Promise<PublicStoreProfile | null> => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;

    const client = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error } = await client.rpc("public_get_store_profile", {
      p_slug: data.slug,
    });
    if (error) return null;
    return (row as PublicStoreProfile | null) ?? null;
  });
