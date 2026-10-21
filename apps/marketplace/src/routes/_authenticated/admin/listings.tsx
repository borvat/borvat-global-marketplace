import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Toolbar,
  Pager,
  StatusPill,
  fmtDate,
  friendlyError,
  useCursorStack,
  type StatusFilter,
} from "@/lib/admin/ui";

export const Route = createFileRoute("/_authenticated/admin/listings")({
  component: AdminListings,
});

const PAGE_SIZE = 25;

type Row = {
  company_id: string;
  company_name: string;
  merchant_store_id: string;
  store_name: string;
  channel_account_id: string;
  listing_id: string;
  sku_id: string;
  sku_code: string;
  product_id: string;
  product_title: string;
  brand: string;
  listing_status: string;
  control_state: string;
  published_quantity: number;
  created_at: string;
  updated_at: string;
};

function AdminListings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [applied, setApplied] = useState({ search: "", status: "" as StatusFilter });
  const cursor = useCursorStack();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const c = cursor.current;
      const { data, error } = await supabase.rpc("admin_list_borvat_direct_draft_listings", {
        _page_size: PAGE_SIZE,
        _after_created_at: c?.created_at ?? undefined,
        _after_id: c?.id ?? undefined,
        _search: applied.search.trim() || undefined,
        _status: applied.status || undefined,
      });
      if (cancelled) return;
      if (error) {
        setRows([]);
        setHasMore(false);
        setError(friendlyError(error));
        setLoading(false);
        return;
      }
      const list = (data ?? []) as Row[];
      const more = list.length > PAGE_SIZE;
      setRows(more ? list.slice(0, PAGE_SIZE) : list);
      setHasMore(more);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applied, cursor.current]);

  return (
    <div>
      <Toolbar
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        onApply={() => {
          cursor.reset();
          setApplied({ search, status });
        }}
      />

      {error && (
        <div className="bg-card border border-border rounded p-6 text-center">
          <div className="font-medium">{error}</div>
        </div>
      )}

      {!error && (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Control</th>
                <th className="px-3 py-2">Qty (diag.)</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No results.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.listing_id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{r.company_name}</td>
                    <td className="px-3 py-2">{r.store_name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.sku_code}</td>
                    <td className="px-3 py-2">{r.product_title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.brand}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={r.listing_status} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-amber-50 text-amber-800 border border-amber-200">
                        {r.control_state}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.published_quantity}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <Pager
          canBack={cursor.canBack}
          hasMore={hasMore}
          onBack={cursor.back}
          onNext={() => {
            const last = rows[rows.length - 1];
            if (last) cursor.push({ created_at: last.created_at, id: last.listing_id });
          }}
        />
      )}
    </div>
  );
}
