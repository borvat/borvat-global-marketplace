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
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { demoPromotions } from "@/demo/ops";

export const Route = createFileRoute("/_authenticated/seller/promotions")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Promotions — Borvat Seller Manager" },
      { name: "description", content: "Campaign calendar, deals and price drops for your Borvat shop." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Promotions — Borvat Seller Manager" },
      { property: "og:description", content: "Campaigns, deals and price drops." },
    ],
  }),
  component: SellerPromotions,
});

function SellerPromotions() {
  const store = storeById(demoActiveStoreId)!;
  const [tab, setTab] = useState("active");
  const rows = demoPromotions.filter((p) => (tab === "all" ? true : p.status === tab));

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Promotions"
      subtitle="Campaign calendar and participating articles"
      actions={<DemoAction label="New promotion" size="sm" variant="primary" />}
      tabs={
        <Tabs
          tabs={[
            { id: "active", label: "Active", count: demoPromotions.filter((p) => p.status === "active").length },
            { id: "pending", label: "Pending", count: demoPromotions.filter((p) => p.status === "pending").length },
            { id: "draft", label: "Draft", count: demoPromotions.filter((p) => p.status === "draft").length },
            { id: "expired", label: "Expired", count: demoPromotions.filter((p) => p.status === "expired").length },
            { id: "all", label: "All", count: demoPromotions.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active promotions" value={String(demoPromotions.filter((p) => p.status === "active").length)} tone="good" />
        <Metric label="Articles in promo" value="7" />
        <Metric label="Promo revenue (30d)" value="€ 4.120,00" />
        <Metric label="Upcoming deals" value="1" tone="warn" />
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DataTable columns={["Promotion", "Type", "Window", "Articles", "Discount", "Status", ""]} minWidth={800}>
          {rows.map((p) => (
            <Row key={p.id}>
              <Cell className="font-medium">{p.name}</Cell>
              <Cell className="text-[12px] capitalize">{p.type.replace(/_/g, " ")}</Cell>
              <Cell className="text-[12px]">{p.window}</Cell>
              <Cell className="tabular-nums">{p.products}</Cell>
              <Cell className="tabular-nums">{p.discount}</Cell>
              <Cell>
                <StatusBadge tone={toneForStatus(p.status)}>{p.status}</StatusBadge>
              </Cell>
              <Cell>
                <DemoAction label="Manage" size="sm" />
              </Cell>
            </Row>
          ))}
        </DataTable>
        <Card title="Campaign calendar" description="July – August 2026">
          <ul className="space-y-1.5 text-[13px]">
            {demoPromotions.map((p) => (
              <li key={p.id} className="rounded-sm border border-border px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  <StatusBadge tone={toneForStatus(p.status)}>{p.status}</StatusBadge>
                </div>
                <span className="text-[12px] text-muted-foreground">{p.window}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </ManagerShell>
  );
}
