import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  Metric,
  Card,
  Tabs,
  DemoAction,
  BarChart,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { demoAdCampaigns } from "@/demo/ops";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/advertising")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Advertising — Borvat Seller Manager" },
      { name: "description", content: "Campaign overview, budget, reports and media plan for Borvat advertising." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Advertising — Borvat Seller Manager" },
      { property: "og:description", content: "Ad campaigns, budget and reports." },
    ],
  }),
  component: SellerAdvertising,
});

function SellerAdvertising() {
  const store = storeById(demoActiveStoreId)!;
  const [tab, setTab] = useState("overview");
  const spent = demoAdCampaigns.reduce((s, c) => s + c.spentCents, 0);
  const budget = demoAdCampaigns.reduce((s, c) => s + c.budgetCents, 0);
  const clicks = demoAdCampaigns.reduce((s, c) => s + c.clicks, 0);

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Advertising"
      subtitle="Sponsored placements inside the Borvat marketplace"
      actions={<DemoAction label="New campaign" size="sm" variant="primary" />}
      tabs={
        <Tabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "budget", label: "Budget" },
            { id: "reports", label: "Reports" },
            { id: "mediaplan", label: "Media plan" },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Spend (period)" value={formatEur(spent)} />
        <Metric label="Budget" value={formatEur(budget)} />
        <Metric label="Clicks" value={String(clicks)} />
        <Metric label="Average ACoS" value="10,4%" tone="warn" />
      </div>

      {tab === "overview" || tab === "reports" ? (
        <div className="mt-2">
          <DataTable columns={["Campaign", "Objective", "Budget", "Spent", "Impressions", "Clicks", "ACoS", "Status", ""]} minWidth={980}>
            {demoAdCampaigns.map((c) => (
              <Row key={c.id}>
                <Cell className="font-medium">{c.name}</Cell>
                <Cell className="capitalize">{c.objective}</Cell>
                <Cell className="tabular-nums">{formatEur(c.budgetCents)}</Cell>
                <Cell className="tabular-nums">{formatEur(c.spentCents)}</Cell>
                <Cell className="tabular-nums">{c.impressions.toLocaleString("nl-NL")}</Cell>
                <Cell className="tabular-nums">{c.clicks.toLocaleString("nl-NL")}</Cell>
                <Cell className="tabular-nums">{c.acos}</Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge>
                </Cell>
                <Cell>
                  <DemoAction label="Manage" size="sm" />
                </Cell>
              </Row>
            ))}
          </DataTable>
        </div>
      ) : null}

      {tab === "budget" ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <Card title="Budget consumption">
            <BarChart
              data={demoAdCampaigns.map((c) => ({ label: c.name.split(" ")[0], value: c.spentCents / 100 }))}
              format={(v) => formatEur(v * 100)}
            />
          </Card>
          <Card title="Daily caps">
            <ul className="space-y-1 text-[13px]">
              {demoAdCampaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <span className="tabular-nums">{formatEur(Math.round(c.budgetCents / 30))} / day</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === "mediaplan" ? (
        <div className="mt-2">
          <Card title="Media plan Q3 2026">
            <ul className="space-y-1.5 text-[13px]">
              <li className="flex justify-between rounded-sm border border-border px-2 py-1.5"><span>Week 30–32 · Zomer Woonweken homepage banner</span><StatusBadge tone="warn">reserved</StatusBadge></li>
              <li className="flex justify-between rounded-sm border border-border px-2 py-1.5"><span>Week 33 · Category takeover “Wonen”</span><StatusBadge tone="info">option</StatusBadge></li>
              <li className="flex justify-between rounded-sm border border-border px-2 py-1.5"><span>Week 35–36 · Newsletter feature</span><StatusBadge>draft</StatusBadge></li>
            </ul>
          </Card>
        </div>
      ) : null}
    </ManagerShell>
  );
}
