import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Store, ChevronRight, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/seller/stores")({
  head: () => ({
    meta: [
      { title: "Merchant stores — Borvat" },
      { name: "description", content: "Read-only overview of your Borvat merchant stores." },
      { property: "og:title", content: "Merchant stores — Borvat" },
      { property: "og:description", content: "Internal draft environment." },
    ],
  }),
  component: StoresList,
});

type StoreRow = {
  id: string;
  company_id: string;
  slug: string;
  display_name: string;
  status: string;
  is_primary: boolean;
  default_locale: string | null;
  default_currency: string | null;
  created_at: string;
};

type CompanyRow = { id: string; name: string };

function StatusBadge({ status }: { status: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
        {status}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-amber-700">
        Not customer-visible
      </span>
    </div>
  );
}

function StoresList() {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [companies, setCompanies] = useState<Record<string, CompanyRow>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }
      // RLS scopes to companies where the user is an active member.
      const { data, error } = await supabase
        .from("merchant_stores")
        .select(
          "id,company_id,slug,display_name,status,is_primary,default_locale,default_currency,created_at",
        )
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) {
        setError("Access denied or read failed.");
        setLoading(false);
        return;
      }
      setStores(data ?? []);

      const companyIds = [...new Set((data ?? []).map((s) => s.company_id))];
      if (companyIds.length) {
        const { data: cs } = await supabase
          .from("companies")
          .select("id,name")
          .in("id", companyIds);
        const map: Record<string, CompanyRow> = {};
        (cs ?? []).forEach((c) => (map[c.id] = c));
        setCompanies(map);
      }
      setLoading(false);
    })();
  }, []);

  const grouped: Record<string, StoreRow[]> = {};
  stores.forEach((s) => {
    (grouped[s.company_id] ||= []).push(s);
  });
  const companyIds = Object.keys(grouped);

  return (
    <div className="max-w-5xl mx-auto px-3 py-4">
      <div className="mb-4 rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm flex gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          Internal draft environment — products are not visible or purchasable by customers.
          This view is read-only.
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Store className="w-6 h-6 text-brand" /> Merchant stores
      </h1>

      {loading && <div className="text-muted-foreground">Loading…</div>}
      {!loading && error && (
        <div className="bg-card border border-border rounded p-6 text-center">
          <div className="font-medium mb-1">Access denied</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
      {!loading && !error && stores.length === 0 && (
        <div className="bg-card border border-border rounded p-6 text-center text-muted-foreground">
          No merchant stores available for your account.
        </div>
      )}

      {companyIds.map((cid) => (
        <section key={cid} className="mb-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Company: {companies[cid]?.name ?? cid.slice(0, 8)}
          </div>
          <div className="bg-card border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Locale</th>
                  <th className="px-3 py-2">Primary</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {grouped[cid].map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{s.display_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.slug}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.default_locale ?? "—"} / {s.default_currency ?? "—"}
                    </td>
                    <td className="px-3 py-2">{s.is_primary ? "Yes" : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/seller/stores/$storeId"
                        params={{ storeId: s.id }}
                        className="text-brand text-sm inline-flex items-center gap-1 hover:underline"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
