import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, ArrowLeft, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/stores/$storeId")({
  head: () => ({
    meta: [
      { title: "Store detail — Borvat" },
      { name: "description", content: "Read-only merchant store detail." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StoreDetail,
});

type Store = {
  id: string;
  company_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  status: string;
  is_primary: boolean;
  default_locale: string | null;
  default_currency: string | null;
  created_at: string;
  updated_at: string;
};

type Account = {
  id: string;
  provider: string;
  display_name: string | null;
  external_account_id: string | null;
  status: string;
  control_state: string;
  created_at: string;
  updated_at: string;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function StoreDetail() {
  const { storeId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s, error: se } = await supabase
        .from("merchant_stores")
        .select(
          "id,company_id,slug,display_name,description,status,is_primary,default_locale,default_currency,created_at,updated_at",
        )
        .eq("id", storeId)
        .maybeSingle();
      if (se || !s) {
        setError("Store not found or access denied.");
        setLoading(false);
        return;
      }
      setStore(s);

      const { data: acc } = await supabase
        .from("channel_accounts")
        .select(
          "id,provider,display_name,external_account_id,status,control_state,created_at,updated_at",
        )
        .eq("merchant_store_id", storeId)
        .order("created_at", { ascending: true });
      setAccounts(acc ?? []);

      const accountIds = (acc ?? []).map((a) => a.id);
      if (accountIds.length) {
        const { count } = await supabase
          .from("channel_listings")
          .select("id", { count: "exact", head: true })
          .in("channel_account_id", accountIds);
        setListingCount(count ?? 0);
      } else {
        setListingCount(0);
      }
      setLoading(false);
    })();
  }, [storeId]);

  if (loading) return <div className="max-w-4xl mx-auto px-3 py-6 text-muted-foreground">Loading…</div>;
  if (error || !store) {
    return (
      <div className="max-w-lg mx-auto px-3 py-10 text-center">
        <div className="font-medium mb-1">Access denied</div>
        <div className="text-sm text-muted-foreground mb-4">
          {error ?? "This store is not available."}
        </div>
        <Link to="/seller/stores" className="text-brand text-sm hover:underline">
          ← Back to stores
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      <Link
        to="/seller/stores"
        className="text-brand text-sm inline-flex items-center gap-1 mb-3 hover:underline"
      >
        <ArrowLeft className="w-3 h-3" /> Merchant stores
      </Link>

      <div className="mb-4 rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm flex gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          Internal draft environment — this store is not customer-visible, sales are disabled,
          and no inventory sync is active.
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{store.display_name}</h1>
            <div className="text-sm text-muted-foreground">{store.slug}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
              Status: {store.status}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-amber-700">
              Channel state: Not customer-visible · Sales disabled
            </span>
          </div>
        </div>
        {store.description && (
          <p className="mt-3 text-sm text-muted-foreground">{store.description}</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Field label="Primary" value={store.is_primary ? "Yes" : "No"} />
          <Field label="Locale" value={store.default_locale} />
          <Field label="Currency" value={store.default_currency} />
          <Field label="Created" value={new Date(store.created_at).toLocaleDateString()} />
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4 mb-4">
        <h2 className="font-bold mb-3">Channel accounts</h2>
        {accounts.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No channel accounts are accessible to your role. The store may have no linked
            account, or your role may not permit viewing it.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <div key={a.id} className="border border-border rounded p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium">{a.display_name ?? a.provider}</div>
                    <div className="text-xs text-muted-foreground">
                      Provider: {a.provider}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
                      Status: {a.status}
                    </span>
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
                      Control: {a.control_state}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                  <Field label="External account ID" value={a.external_account_id} />
                  <Field label="Created" value={new Date(a.created_at).toLocaleDateString()} />
                  <Field label="Updated" value={new Date(a.updated_at).toLocaleDateString()} />
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Sales disabled · No inventory sync · Not customer-visible
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        to="/seller/stores/$storeId/listings"
        params={{ storeId: store.id }}
        className="bg-card border border-border rounded p-4 flex items-center justify-between hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6 text-brand" />
          <div>
            <div className="font-bold">Draft listings</div>
            <div className="text-xs text-muted-foreground">
              {accounts.length === 0
                ? "Visibility depends on your role"
                : `${listingCount ?? 0} listing${listingCount === 1 ? "" : "s"} · Read-only`}
            </div>
          </div>
        </div>
        <span className="text-brand text-sm">View →</span>
      </Link>
    </div>
  );
}
