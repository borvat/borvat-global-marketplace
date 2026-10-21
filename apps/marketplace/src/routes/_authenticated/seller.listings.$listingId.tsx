import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/listings/$listingId")({
  head: () => ({
    meta: [
      { title: "Listing detail — Borvat" },
      { name: "description", content: "Read-only draft listing detail." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ListingDetail,
});

type Listing = {
  id: string;
  company_id: string;
  channel_account_id: string;
  sku_id: string | null;
  external_listing_id: string | null;
  status: string;
  control_state: string;
  published_quantity: number | null;
  published_version: number | null;
  last_published_at: string | null;
  units_per_offer: number | null;
  channel_cap: number | null;
  created_at: string;
  updated_at: string;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value ?? "—"}</div>
    </div>
  );
}

function ListingDetail() {
  const { listingId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [account, setAccount] = useState<{
    id: string;
    display_name: string | null;
    provider: string;
    status: string;
    control_state: string;
    merchant_store_id: string | null;
  } | null>(null);
  const [store, setStore] = useState<{ id: string; display_name: string; slug: string } | null>(
    null,
  );
  const [sku, setSku] = useState<{
    id: string;
    code: string;
    status: string;
    tracking_mode: string;
    product_id: string | null;
  } | null>(null);
  const [product, setProduct] = useState<{
    id: string;
    title: string;
    brand: string | null;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: l, error: le } = await supabase
        .from("channel_listings")
        .select(
          "id,company_id,channel_account_id,sku_id,external_listing_id,status,control_state,published_quantity,published_version,last_published_at,units_per_offer,channel_cap,created_at,updated_at",
        )
        .eq("id", listingId)
        .maybeSingle();
      if (le || !l) {
        setError("Listing not found or access denied.");
        setLoading(false);
        return;
      }
      setListing(l);

      const { data: acc } = await supabase
        .from("channel_accounts")
        .select("id,display_name,provider,status,control_state,merchant_store_id")
        .eq("id", l.channel_account_id)
        .maybeSingle();
      setAccount(acc);

      if (acc?.merchant_store_id) {
        const { data: st } = await supabase
          .from("merchant_stores")
          .select("id,display_name,slug")
          .eq("id", acc.merchant_store_id)
          .maybeSingle();
        setStore(st);
      }

      if (l.sku_id) {
        const { data: s } = await supabase
          .from("catalog_skus")
          .select("id,code,status,tracking_mode,product_id")
          .eq("id", l.sku_id)
          .maybeSingle();
        setSku(s);
        if (s?.product_id) {
          const { data: p } = await supabase
            .from("catalog_products")
            .select("id,title,brand,status")
            .eq("id", s.product_id)
            .maybeSingle();
          setProduct(p);
        }
      }
      setLoading(false);
    })();
  }, [listingId]);

  if (loading)
    return <div className="max-w-4xl mx-auto px-3 py-6 text-muted-foreground">Loading…</div>;
  if (error || !listing) {
    return (
      <div className="max-w-lg mx-auto px-3 py-10 text-center">
        <div className="font-medium mb-1">Access denied</div>
        <div className="text-sm text-muted-foreground mb-4">
          {error ?? "This listing is not available."}
        </div>
        <Link to="/seller/stores" className="text-brand text-sm hover:underline">
          ← Back to stores
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      {store && (
        <Link
          to="/seller/stores/$storeId/listings"
          params={{ storeId: store.id }}
          className="text-brand text-sm inline-flex items-center gap-1 mb-3 hover:underline"
        >
          <ArrowLeft className="w-3 h-3" /> {store.display_name} · listings
        </Link>
      )}

      <div className="mb-4 rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm flex gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          Draft listing — not customer-visible, sales disabled, no inventory sync. Fields below
          are read-only.
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{product?.title ?? "Listing"}</h1>
            <div className="text-sm text-muted-foreground">
              SKU {sku?.code ?? "—"} · {product?.brand ?? "—"}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
              Status: {listing.status}
            </span>
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
              Control: {listing.control_state}
            </span>
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
              Channel state: Not published · Sales disabled · No inventory sync
            </span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4 mb-4">
        <h2 className="font-bold mb-3">Listing</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Listing ID" value={<code className="text-xs">{listing.id}</code>} />
          <Field
            label="External listing ID"
            value={
              listing.external_listing_id ? (
                <code className="text-xs">{listing.external_listing_id}</code>
              ) : (
                "—"
              )
            }
          />
          <Field label="Published version" value={listing.published_version ?? "—"} />
          <Field
            label="Published quantity (diagnostic)"
            value={listing.published_quantity ?? 0}
          />
          <Field label="Units per offer" value={listing.units_per_offer ?? "—"} />
          <Field label="Channel cap" value={listing.channel_cap ?? "—"} />
          <Field
            label="Last published at"
            value={
              listing.last_published_at
                ? new Date(listing.last_published_at).toLocaleString()
                : "Never"
            }
          />
          <Field label="Created" value={new Date(listing.created_at).toLocaleString()} />
          <Field label="Updated" value={new Date(listing.updated_at).toLocaleString()} />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Not customer-visible · Sales disabled · No inventory sync
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-border rounded p-4">
          <h2 className="font-bold mb-3">Store</h2>
          {store ? (
            <div className="space-y-3">
              <Field label="Name" value={store.display_name} />
              <Field label="Slug" value={store.slug} />
              <Link
                to="/seller/stores/$storeId"
                params={{ storeId: store.id }}
                className="text-brand text-sm hover:underline"
              >
                View store →
              </Link>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </div>
        <div className="bg-card border border-border rounded p-4">
          <h2 className="font-bold mb-3">Channel account</h2>
          {account ? (
            <div className="space-y-3">
              <Field label="Name" value={account.display_name ?? account.provider} />
              <Field label="Provider" value={account.provider} />
              <Field label="Status" value={account.status} />
              <Field label="Control state" value={account.control_state} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4 mb-4">
        <h2 className="font-bold mb-3">SKU & product</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="SKU code" value={sku?.code} />
          <Field label="SKU status" value={sku?.status} />
          <Field label="Tracking mode" value={sku?.tracking_mode} />
          <Field label="Product title" value={product?.title} />
          <Field label="Brand" value={product?.brand} />
          <Field label="Product status" value={product?.status} />
        </div>
      </div>
    </div>
  );
}
