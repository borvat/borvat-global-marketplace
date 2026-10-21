import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  DataTable,
  Row,
  Cell,
  Metric,
  Card,
  Tabs,
  DemoAction,
  BarChart,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import {
  demoCountrySplit,
  demoOrdersSeries,
  demoReturnsSeries,
  demoRevenueSeries,
  demoTopProducts,
} from "@/demo/ops";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/analysis")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sales analysis — Borvat Seller Manager" },
      { name: "description", content: "Sales, product-range and returns analysis for your Borvat shop." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sales analysis — Borvat Seller Manager" },
      { property: "og:description", content: "Sales, range and returns analysis." },
    ],
  }),
  component: SellerAnalysis,
});

function SellerAnalysis() {
  const store = storeById(demoActiveStoreId)!;
  const [tab, setTab] = useState("sales");
  const revenue = demoRevenueSeries.reduce((s, d) => s + d.value, 0) * 100;
  const orders = demoOrdersSeries.reduce((s, d) => s + d.value, 0);
  const returns = demoReturnsSeries.reduce((s, d) => s + d.value, 0);

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Analysis"
      subtitle="Last 8 weeks"
      actions={<DemoAction label="Export CSV" size="sm" />}
      tabs={
        <Tabs
          tabs={[
            { id: "sales", label: "Sales analysis" },
            { id: "range", label: "Product-range analysis" },
            { id: "returns", label: "Returns analysis" },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Revenue" value={formatEur(revenue)} />
        <Metric label="Orders" value={String(orders)} />
        <Metric label="Average order value" value={formatEur(Math.round(revenue / orders))} />
        <Metric label="Return rate" value={`${((returns / orders) * 100).toFixed(1)}%`} tone="warn" />
      </div>

      {tab === "sales" ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          <Card title="Revenue per week" className="lg:col-span-2">
            <BarChart data={demoRevenueSeries} format={(v) => formatEur(v * 100)} />
          </Card>
          <Card title="Country split">
            <ul className="space-y-1 text-[13px]">
              {demoCountrySplit.map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  <span className="w-8 font-medium">{c.label}</span>
                  <span className="h-2 flex-1 rounded-sm bg-muted">
                    <span className="block h-2 rounded-sm bg-brand/80" style={{ width: `${c.value}%` }} />
                  </span>
                  <span className="w-9 text-right tabular-nums">{c.value}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === "range" ? (
        <div className="mt-2">
          <DataTable columns={["SKU", "Product", "Units", "Revenue", "Share"]} minWidth={720}>
            {demoTopProducts.map((p) => {
              const total = demoTopProducts.reduce((s, x) => s + x.revenueCents, 0);
              return (
                <Row key={p.sku}>
                  <Cell className="font-mono text-[12px]">{p.sku}</Cell>
                  <Cell className="max-w-[320px] truncate">{p.title}</Cell>
                  <Cell className="tabular-nums">{p.units}</Cell>
                  <Cell className="tabular-nums">{formatEur(p.revenueCents)}</Cell>
                  <Cell className="tabular-nums">{((p.revenueCents / total) * 100).toFixed(1)}%</Cell>
                </Row>
              );
            })}
          </DataTable>
        </div>
      ) : null}

      {tab === "returns" ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <Card title="Returns per week">
            <BarChart data={demoReturnsSeries} />
          </Card>
          <Card title="Top return reasons">
            <ul className="space-y-1 text-[13px]">
              <li className="flex justify-between"><span>Damaged in transit</span><span className="tabular-nums">42%</span></li>
              <li className="flex justify-between"><span>Not as expected</span><span className="tabular-nums">28%</span></li>
              <li className="flex justify-between"><span>Delivered too late</span><span className="tabular-nums">18%</span></li>
              <li className="flex justify-between"><span>Ordered by mistake</span><span className="tabular-nums">12%</span></li>
            </ul>
          </Card>
        </div>
      ) : null}
    </ManagerShell>
  );
}
