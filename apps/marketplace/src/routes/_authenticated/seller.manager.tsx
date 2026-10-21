import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ManagerShell,
  SELLER_NAV,
  Metric,
  Card,
  StatusBadge,
  toneForStatus,
  DemoAction,
  DataTable,
  Row,
  Cell,
  EmptyState,
} from "@/components/demo/shell";
import { formatEur } from "@/lib/format";
import {
  useActiveSellerWorkspace,
  useSellerCatalog,
  useSellerOverview,
} from "@/hooks/useSellerData";

export const Route = createFileRoute("/_authenticated/seller/manager")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seller dashboard — Borvat Seller Manager" },
      {
        name: "description",
        content:
          "Live read-only overview of listings, stock and required actions for your Borvat shop.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Seller dashboard — Borvat Seller Manager" },
      { property: "og:description", content: "Live operational overview for a Borvat shop." },
    ],
  }),
  component: SellerManagerDashboard,
});

function SellerManagerDashboard() {
  const { active, isLoading: wsLoading, error: wsError } = useActiveSellerWorkspace();
  const overview = useSellerOverview(active?.company_id, active?.store_id);
  const catalog = useSellerCatalog(active?.company_id, active?.store_id, 200, 0);

  const shopName = active?.store_name ?? active?.company_name ?? "Seller Manager";
  const o = overview.data;
  const rows = catalog.data ?? [];
  const actionRows = rows.filter((r) => r.action_reason && r.action_reason !== "none").slice(0, 8);
  const lowStock = rows
    .filter((r) => (r.available ?? 0) <= 5)
    .sort((a, b) => (a.available ?? 0) - (b.available ?? 0))
    .slice(0, 8);

  const loading = wsLoading || overview.isLoading || catalog.isLoading;
  const error = wsError ?? (overview.error as Error | null) ?? (catalog.error as Error | null);

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={shopName}
      nav={SELLER_NAV}
      classification="REAL READ-ONLY"
      title={`${shopName} — dashboard`}
      subtitle="Live data from your Borvat account · read-only"
      actions={
        <>
          <DemoAction label="Import products" size="sm" />
          <DemoAction label="Add product" size="sm" variant="primary" />
        </>
      }
    >
      {error ? (
        <Card title="Data unavailable">
          <p className="text-[13px] text-muted-foreground">{error.message}</p>
        </Card>
      ) : !loading && !active ? (
        <EmptyState
          title="No shop linked to this account"
          hint="This account is not an active member of any Borvat company yet."
        />
      ) : (

        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Active listings"
              value={loading ? "…" : String(o?.active_listings ?? 0)}
              hint="Published SKUs"
              to="/seller/catalog"
            />
            <Metric
              label="Draft listings"
              value={loading ? "…" : String(o?.draft_listings ?? 0)}
              tone={(o?.draft_listings ?? 0) > 0 ? "warn" : "neutral"}
              to="/seller/catalog"
            />
            <Metric
              label="Action required"
              value={loading ? "…" : String(o?.action_required ?? 0)}
              hint="Missing price / tax"
              tone={(o?.action_required ?? 0) > 0 ? "bad" : "neutral"}
              to="/seller/catalog"
            />
            <Metric
              label="Low stock"
              value={loading ? "…" : String(o?.low_stock_items ?? 0)}
              tone={(o?.low_stock_items ?? 0) > 0 ? "warn" : "neutral"}
              to="/seller/inventory"
            />
            <Metric
              label="Available units"
              value={loading ? "…" : String(o?.total_available ?? 0)}
              hint={`${o?.total_reserved ?? 0} reserved`}
              to="/seller/inventory"
            />
            <Metric
              label="Fulfilment origins"
              value={loading ? "…" : String(o?.fulfillment_origins ?? 0)}
              to="/seller/shipping"
            />
          </div>

          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <Card title="Listings needing attention" description="Live catalog checks">
              {actionRows.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {loading ? "Loading…" : "No blocking issues on your listings."}
                </p>
              ) : (
                <DataTable columns={["SKU", "Product", "Issue"]} minWidth={420}>
                  {actionRows.map((r) => (
                    <Row key={r.sku_id}>
                      <Cell className="font-mono text-[12px]">{r.sku_code ?? "—"}</Cell>
                      <Cell className="max-w-[260px] truncate">{r.title ?? "—"}</Cell>
                      <Cell>
                        <StatusBadge tone={toneForStatus("review")}>
                          {r.action_reason}
                        </StatusBadge>
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
              <Link to="/seller/catalog" className="mt-2 inline-block text-[12px] text-brand hover:underline">
                Open products
              </Link>
            </Card>

            <Card title="Lowest stock" description="Available units per SKU">
              {lowStock.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {loading ? "Loading…" : "No stock data available yet."}
                </p>
              ) : (
                <DataTable columns={["SKU", "Product", "Available", "Price"]} minWidth={460}>
                  {lowStock.map((r) => (
                    <Row key={r.sku_id}>
                      <Cell className="font-mono text-[12px]">{r.sku_code ?? "—"}</Cell>
                      <Cell className="max-w-[240px] truncate">{r.title ?? "—"}</Cell>
                      <Cell className="tabular-nums">{r.available ?? 0}</Cell>
                      <Cell className="tabular-nums">
                        {r.price_minor == null ? "—" : formatEur(Number(r.price_minor))}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
              <Link to="/seller/inventory" className="mt-2 inline-block text-[12px] text-brand hover:underline">
                Open inventory
              </Link>
            </Card>
          </div>
        </>
      )}
    </ManagerShell>
  );
}
