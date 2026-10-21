import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, ArrowLeft, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/stores/$storeId/listings")({
  head: () => ({
    meta: [
      { title: "Draft listings — Borvat" },
      { name: "description", content: "Read-only draft listings for this store." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StoreListings,
});

type Listing = {
  id: string;
  channel_account_id: string;
  sku_id: string | null;
  external_listing_id: string | null;
  status: string;
  control_state: string;
  published_quantity: number | null;
  created_at: string;
  updated_at: string;
};

type Sku = { id: string; code: string; product_id: string | null; status: string };
type Product = { id: string; title: string };

const PAGE_SIZE = 25;

function StoreListings() {
  const { storeId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState<string>("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [skus, setSkus] = useState<Record<string, Sku>>({});
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [page, setPage] = useState(0);
  const [noAccessibleAccounts, setNoAccessibleAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: store, error: se } = await supabase
        .from("merchant_stores")
        .select("id,display_name")
        .eq("id", storeId)
        .maybeSingle();
      if (se || !store) {
        setError("Store not found or access denied.");
        setLoading(false);
        return;
      }
      setStoreName(store.display_name);

      const { data: accs } = await supabase
        .from("channel_accounts")
        .select("id")
        .eq("merchant_store_id", storeId);
      const accountIds = (accs ?? []).map((a) => a.id);
      setNoAccessibleAccounts(accountIds.length === 0);
      if (!accountIds.length) {
        setListings([]);
        setLoading(false);
        return;
      }

      const { data: ls } = await supabase
        .from("channel_listings")
        .select(
          "id,channel_account_id,sku_id,external_listing_id,status,control_state,published_quantity,created_at,updated_at",
        )
        .in("channel_account_id", accountIds)
        .order("created_at", { ascending: false });
      setListings(ls ?? []);

      const skuIds = [...new Set((ls ?? []).map((l) => l.sku_id).filter(Boolean) as string[])];
      if (skuIds.length) {
        const { data: sk } = await supabase
          .from("catalog_skus")
          .select("id,code,product_id,status")
          .in("id", skuIds);
        const skuMap: Record<string, Sku> = {};
        (sk ?? []).forEach((s) => (skuMap[s.id] = s));
        setSkus(skuMap);

        const productIds = [
          ...new Set((sk ?? []).map((s) => s.product_id).filter(Boolean) as string[]),
        ];
        if (productIds.length) {
          const { data: pr } = await supabase
            .from("catalog_products")
            .select("id,title")
            .in("id", productIds);
          const pmap: Record<string, Product> = {};
          (pr ?? []).forEach((p) => (pmap[p.id] = p));
          setProducts(pmap);
        }
      }
      setLoading(false);
    })();
  }, [storeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      const sku = l.sku_id ? skus[l.sku_id] : undefined;
      const product = sku?.product_id ? products[sku.product_id] : undefined;
      return (
        sku?.code?.toLowerCase().includes(q) ||
        product?.title?.toLowerCase().includes(q) ||
        l.external_listing_id?.toLowerCase().includes(q)
      );
    });
  }, [listings, skus, products, statusFilter, query]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  if (loading) return <div className="max-w-6xl mx-auto px-3 py-6 text-muted-foreground">Loading…</div>;
  if (error) {
    return (
      <div className="max-w-lg mx-auto px-3 py-10 text-center">
        <div className="font-medium mb-1">Access denied</div>
        <div className="text-sm text-muted-foreground mb-4">{error}</div>
        <Link to="/seller/stores" className="text-brand text-sm hover:underline">
          ← Back to stores
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 py-4">
      <Link
        to="/seller/stores/$storeId"
        params={{ storeId }}
        className="text-brand text-sm inline-flex items-center gap-1 mb-3 hover:underline"
      >
        <ArrowLeft className="w-3 h-3" /> {storeName}
      </Link>

      <div className="mb-4 rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm flex gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          Draft listings — not customer-visible. Quantities shown are diagnostic and do not
          reflect sellable stock.
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-4">Draft listings</h1>

      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 border border-border rounded px-2 bg-background">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search SKU, product, or listing ID"
            className="py-2 bg-transparent outline-none text-sm w-72"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="border border-border rounded px-2 py-2 bg-background text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded p-6 text-center text-muted-foreground">
          {noAccessibleAccounts
            ? "No channel accounts are accessible to your role. The store may have no linked account, or your role may not permit viewing listings."
            : "No listings match your filter."}
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Channel state</th>
                  <th className="px-3 py-2">Control</th>
                  <th className="px-3 py-2">Qty (diag)</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((l) => {
                  const sku = l.sku_id ? skus[l.sku_id] : undefined;
                  const product = sku?.product_id ? products[sku.product_id] : undefined;
                  return (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{product?.title ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{sku?.code ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
                          {l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          Not published · Sales disabled
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{l.control_state}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {l.published_quantity ?? 0}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(l.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to="/seller/listings/$listingId"
                          params={{ listingId: l.id }}
                          className="text-brand text-sm hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-sm">
              <div className="text-muted-foreground">
                Page {page + 1} of {totalPages} · {filtered.length} listings
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="border border-border rounded px-3 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="border border-border rounded px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
