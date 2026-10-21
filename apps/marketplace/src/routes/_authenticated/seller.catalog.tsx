import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  SearchInput,
  FilterSelect,
  Tabs,
  Toolbar,
  DemoAction,
  Drawer,
  KeyValue,
  Pagination,
  EmptyState,
  Card,
} from "@/components/demo/shell";
import { formatEur } from "@/lib/format";
import {
  useActiveSellerWorkspace,
  useSellerCatalog,
  type SellerCatalogRow,
} from "@/hooks/useSellerData";

export const Route = createFileRoute("/_authenticated/seller/catalog")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Products — Borvat Seller Manager" },
      {
        name: "description",
        content: "Live read-only view of every listing, SKU, price and stock level in your shop.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Products — Borvat Seller Manager" },
      { property: "og:description", content: "Live listings, price and stock." },
    ],
  }),
  component: SellerCatalog,
});

const TABS = [
  { id: "all", label: "All" },
  { id: "for_sale", label: "For sale" },
  { id: "not_for_sale", label: "Not for sale" },
  { id: "no_stock", label: "No stock" },
  { id: "problems", label: "Action required" },
];

const PAGE_SIZE = 25;

function isPublished(r: SellerCatalogRow) {
  return (r.publication_status ?? r.product_status) === "published" ||
    r.product_status === "active";
}

function matchTab(r: SellerCatalogRow, tab: string) {
  switch (tab) {
    case "for_sale":
      return isPublished(r) && (r.available ?? 0) > 0;
    case "not_for_sale":
      return !isPublished(r) || (r.available ?? 0) === 0;
    case "no_stock":
      return (r.available ?? 0) === 0;
    case "problems":
      return Boolean(r.action_reason) && r.action_reason !== "none";
    default:
      return true;
  }
}

function SellerCatalog() {
  const { active, isLoading: wsLoading, error: wsError } = useActiveSellerWorkspace();
  const catalog = useSellerCatalog(active?.company_id, active?.store_id, 500, 0);

  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SellerCatalogRow | null>(null);

  const all = catalog.data ?? [];
  const statuses = useMemo(
    () =>
      Array.from(new Set(all.map((r) => r.product_status).filter(Boolean) as string[])).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => matchTab(r, tab))
      .filter((r) => (status === "all" ? true : r.product_status === status))
      .filter((r) =>
        needle === ""
          ? true
          : `${r.title ?? ""} ${r.sku_code ?? ""} ${r.brand ?? ""}`.toLowerCase().includes(needle),
      );
  }, [all, tab, status, q]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const shopName = active?.store_name ?? active?.company_name ?? "Seller Manager";
  const loading = wsLoading || catalog.isLoading;
  const error = wsError ?? (catalog.error as Error | null);

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={shopName}
      nav={SELLER_NAV}
      classification="REAL READ-ONLY"
      title="Products"
      subtitle="Live listings from your Borvat catalog · read-only"
      tabs={<Tabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setPage(0); }} />}
      actions={<DemoAction label="Export CSV" size="sm" />}
    >
      {error ? (
        <Card title="Data unavailable">
          <p className="text-[13px] text-muted-foreground">{error.message}</p>
        </Card>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search title, SKU or brand…" />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); setPage(0); }}
              options={[
                { value: "all", label: "All statuses" },
                ...statuses.map((s) => ({ value: s, label: s })),
              ]}
            />
            <span className="text-[12px] text-muted-foreground">
              {loading ? "Loading…" : `${rows.length} of ${all.length} SKUs`}
            </span>
          </Toolbar>

          {!loading && rows.length === 0 ? (
            <EmptyState
              title="No listings found"
              hint="No catalog rows match this filter for the selected shop."
            />
          ) : (
            <DataTable
              columns={["SKU", "Product", "Brand", "Status", "Price", "Available", "Reserved", "Action"]}
              minWidth={980}
            >
              {pageRows.map((r) => (
                <Row key={r.sku_id} onClick={() => setSelected(r)}>
                  <Cell className="font-mono text-[12px]">{r.sku_code ?? "—"}</Cell>
                  <Cell className="max-w-[300px] truncate">{r.title ?? "—"}</Cell>
                  <Cell className="text-[12px] text-muted-foreground">{r.brand ?? "—"}</Cell>
                  <Cell>
                    <StatusBadge tone={toneForStatus(r.product_status ?? "draft")}>
                      {r.product_status ?? "unknown"}
                    </StatusBadge>
                  </Cell>
                  <Cell className="tabular-nums">
                    {r.price_minor == null ? "—" : formatEur(Number(r.price_minor))}
                  </Cell>
                  <Cell className="tabular-nums">{r.available ?? 0}</Cell>
                  <Cell className="tabular-nums">{r.reserved ?? 0}</Cell>
                  <Cell>
                    {r.action_reason && r.action_reason !== "none" ? (
                      <StatusBadge tone="warn">{r.action_reason}</StatusBadge>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}

          <div className="flex items-center justify-between gap-2">
            <Pagination page={page + 1} pageSize={PAGE_SIZE} total={rows.length} />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((v) => Math.max(0, v - 1))}
                disabled={page === 0}
                className="rounded-sm border border-border bg-card px-2 py-1 text-[12px] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((v) => ((v + 1) * PAGE_SIZE >= rows.length ? v : v + 1))
                }
                disabled={(page + 1) * PAGE_SIZE >= rows.length}
                className="rounded-sm border border-border bg-card px-2 py-1 text-[12px] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Listing"}
      >
        {selected ? (
          <KeyValue
            items={[
              ["SKU", selected.sku_code ?? "—"],
              ["Brand", selected.brand ?? "—"],
              ["Product status", selected.product_status ?? "—"],
              ["SKU status", selected.sku_status ?? "—"],
              ["Price", selected.price_minor == null ? "—" : formatEur(Number(selected.price_minor))],
              ["Currency", selected.currency_code ?? "—"],
              ["Available", String(selected.available ?? 0)],
              ["Reserved", String(selected.reserved ?? 0)],
              ["Publication", selected.publication_status ?? "—"],
              ["Tax classification", selected.tax_classification ?? "—"],
              ["Fulfilment origin", selected.fulfillment_origin ?? "—"],
              ["Delivery promise", selected.delivery_promise ?? "—"],
              ["Action required", selected.action_reason ?? "none"],
            ]}
          />
        ) : null}
      </Drawer>
    </ManagerShell>
  );
}
