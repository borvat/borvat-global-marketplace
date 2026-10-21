import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  Card,
  Tabs,
  DemoAction,
  KeyValue,
  StatusBadge,
  toneForStatus,
  DataTable,
  Row,
  Cell,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById, companyById } from "@/demo/companies";

export const Route = createFileRoute("/_authenticated/seller/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Shop settings — Borvat Seller Manager" },
      { name: "description", content: "Shop identity, apps and integrations, users and notification settings." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Shop settings — Borvat Seller Manager" },
      { property: "og:description", content: "Shop identity, apps and users." },
    ],
  }),
  component: SellerSettings,
});

function SellerSettings() {
  const store = storeById(demoActiveStoreId)!;
  const company = companyById(store.companyId)!;
  const [tab, setTab] = useState("shop");

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Settings"
      subtitle={`${company.name} · Seller ID BRV-100482`}
      tabs={
        <Tabs
          tabs={[
            { id: "shop", label: "Shop" },
            { id: "apps", label: "Apps & integrations" },
            { id: "users", label: "Users" },
            { id: "notifications", label: "Notifications" },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      {tab === "shop" ? (
        <div className="grid gap-2 lg:grid-cols-2">
          <Card title="Shop identity" action={<DemoAction label="Edit" size="sm" />}>
            <KeyValue
              items={[
                ["Shop name", store.name],
                ["Slug", store.slug],
                ["Markets", store.markets.join(", ")],
                ["Status", <StatusBadge tone={toneForStatus(store.status)}>{store.status}</StatusBadge>],
                ["Verification", <StatusBadge tone={toneForStatus(store.verification)}>{store.verification}</StatusBadge>],
                ["Rating", store.rating ? `${store.rating} / 5` : "—"],
              ]}
            />
          </Card>
          <Card title="Company" action={<DemoAction label="Edit" size="sm" />}>
            <KeyValue
              items={[
                ["Legal name", company.name],
                ["Country", company.country],
                ["VAT number", company.vatNumber],
                ["Chamber of commerce", company.kvk],
                ["Onboarded", company.onboardedAt],
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === "apps" ? (
        <DataTable columns={["Integration", "Type", "Scope", "Status", ""]} minWidth={700}>
          <Row>
            <Cell className="font-medium">Borvat Direct</Cell>
            <Cell>Native channel</Cell>
            <Cell>Catalog, orders, shipping</Cell>
            <Cell><StatusBadge tone="good">connected</StatusBadge></Cell>
            <Cell><DemoAction label="Manage" size="sm" /></Cell>
          </Row>
          <Row>
            <Cell className="font-medium">Bol Seller API</Cell>
            <Cell>External channel</Cell>
            <Cell>Read-only sandbox</Cell>
            <Cell><StatusBadge tone="warn">sandbox</StatusBadge></Cell>
            <Cell><DemoAction label="Manage" size="sm" /></Cell>
          </Row>
          <Row>
            <Cell className="font-medium">Warehouse CSV import</Cell>
            <Cell>Automation</Cell>
            <Cell>Stock levels</Cell>
            <Cell><StatusBadge tone="neutral">not connected</StatusBadge></Cell>
            <Cell><DemoAction label="Connect" size="sm" /></Cell>
          </Row>
        </DataTable>
      ) : null}

      {tab === "users" ? (
        <DataTable columns={["User", "Role", "Last active", "Status", ""]} minWidth={640}>
          <Row>
            <Cell className="font-medium">owner@vandenberg.demo</Cell>
            <Cell>Shop owner</Cell>
            <Cell className="text-[12px]">2026-07-26 08:10</Cell>
            <Cell><StatusBadge tone="good">active</StatusBadge></Cell>
            <Cell><DemoAction label="Manage" size="sm" /></Cell>
          </Row>
          <Row>
            <Cell className="font-medium">logistiek@vandenberg.demo</Cell>
            <Cell>Fulfilment</Cell>
            <Cell className="text-[12px]">2026-07-25 16:42</Cell>
            <Cell><StatusBadge tone="good">active</StatusBadge></Cell>
            <Cell><DemoAction label="Manage" size="sm" /></Cell>
          </Row>
        </DataTable>
      ) : null}

      {tab === "notifications" ? (
        <Card title="Notification preferences">
          <ul className="space-y-1.5 text-[13px]">
            {["New order", "Question received", "Quote offer expiring", "Low stock", "Performance breach"].map((n) => (
              <li key={n} className="flex items-center justify-between rounded-sm border border-border px-2 py-1.5">
                <span>{n}</span>
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  E-mail · in-app
                  <DemoAction label="Change" size="sm" />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </ManagerShell>
  );
}
