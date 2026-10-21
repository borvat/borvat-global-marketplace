import { createFileRoute } from "@tanstack/react-router";
import {
  ManagerShell,
  SELLER_NAV,
  Card,
  StatusBadge,
  toneForStatus,
  DemoAction,
  EmptyState,
} from "@/components/demo/shell";
import {
  useActiveSellerWorkspace,
  useSellerOverview,
  useSellerStoreProfile,
} from "@/hooks/useSellerData";

export const Route = createFileRoute("/_authenticated/seller/store")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Store — Borvat Seller Manager" },
      {
        name: "description",
        content: "Live read-only store profile, market settings and fulfilment origin summary.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Store — Borvat Seller Manager" },
      { property: "og:description", content: "Live store profile and channel status." },
    ],
  }),
  component: SellerStore,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function SellerStore() {
  const { active, isLoading: wsLoading, error: wsError } = useActiveSellerWorkspace();
  const profile = useSellerStoreProfile(active?.company_id, active?.store_id);
  const overview = useSellerOverview(active?.company_id, active?.store_id);

  const shopName = active?.store_name ?? active?.company_name ?? "Seller Manager";
  const loading = wsLoading || profile.isLoading;
  const error = wsError ?? (profile.error as Error | null);
  const p = profile.data;

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={shopName}
      nav={SELLER_NAV}
      classification="REAL READ-ONLY"
      title="Store"
      subtitle="Live store profile · read-only"
      actions={<DemoAction label="Edit store" size="sm" />}
    >
      {error ? (
        <Card title="Data unavailable">
          <p className="text-[13px] text-muted-foreground">{error.message}</p>
        </Card>
      ) : !loading && !p ? (
        <EmptyState
          title="No store profile"
          hint="This company has no merchant store configured yet."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Store profile">
            <Field label="Store name" value={p?.display_name ?? (loading ? "…" : "—")} />
            <Field label="Public slug" value={p?.slug ? `/${p.slug}` : "—"} />
            <Field
              label="Status"
              value={
                p?.status ? (
                  <StatusBadge tone={toneForStatus(p.status)}>{p.status}</StatusBadge>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Primary store" value={p?.is_primary ? "Yes" : "No"} />
            <Field label="Country" value={p?.country_code ?? "—"} />
            <Field label="Locale / currency" value={`${p?.default_locale ?? "—"} · ${p?.default_currency ?? "—"}`} />
          </Card>

          <Card title="Company">
            <Field label="Legal entity" value={p?.company_name ?? "—"} />
            <Field label="Company ID" value={<span className="font-mono text-xs">{active?.company_id ?? "—"}</span>} />
            <Field label="Store ID" value={<span className="font-mono text-xs">{p?.store_id ?? "—"}</span>} />
            <Field
              label="Created"
              value={p?.created_at ? new Date(p.created_at).toLocaleDateString("en-GB") : "—"}
            />
          </Card>

          <Card title="Operational summary">
            <Field label="Active listings" value={String(overview.data?.active_listings ?? 0)} />
            <Field label="Draft listings" value={String(overview.data?.draft_listings ?? 0)} />
            <Field label="Fulfilment origins" value={String(overview.data?.fulfillment_origins ?? 0)} />
            <Field label="Available units" value={String(overview.data?.total_available ?? 0)} />
            <Field label="Reserved units" value={String(overview.data?.total_reserved ?? 0)} />
          </Card>

          <Card title="Policies & channels">
            <Field label="Sales terms" value={p?.sales_terms_url ?? "—"} />
            <Field label="Returns policy" value={p?.returns_policy_url ?? "—"} />
            <Field label="Bol live mode" value={<StatusBadge tone="bad">blocked by governance gate</StatusBadge>} />
          </Card>
        </div>
      )}
    </ManagerShell>
  );
}
