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
  Toolbar,
  SearchInput,
  DemoAction,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { demoInvoices } from "@/demo/ops";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/finances")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finances — Borvat Seller Manager" },
      { name: "description", content: "Billing periods, payouts, commission and invoice history for your Borvat shop." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Finances — Borvat Seller Manager" },
      { property: "og:description", content: "Payouts, commission and invoices." },
    ],
  }),
  component: SellerFinances,
});

function SellerFinances() {
  const store = storeById(demoActiveStoreId)!;
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const rows = demoInvoices
    .filter((i) => (tab === "all" ? true : i.type === tab))
    .filter((i) => (q ? (i.period + i.type).toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Finances"
      subtitle="Billing period 16–31 July 2026"
      actions={<DemoAction label="Download statements" size="sm" />}
      tabs={
        <Tabs
          tabs={[
            { id: "all", label: "All documents", count: demoInvoices.length },
            { id: "payout", label: "Payouts" },
            { id: "commission", label: "Commission" },
            { id: "advertising", label: "Advertising" },
            { id: "correction", label: "Corrections" },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open balance" value={formatEur(1104500)} hint="Next payout 01 Aug" />
        <Metric label="Paid this month" value={formatEur(1842300)} tone="good" />
        <Metric label="Commission" value={formatEur(-221000)} hint="Incl. 21% VAT" />
        <Metric label="Advertising spend" value={formatEur(-18900)} tone="warn" />
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Search period or type…" />
            <span className="ml-auto text-[12px] text-muted-foreground">Amounts include VAT</span>
          </Toolbar>
          <DataTable columns={["Issued", "Period", "Type", "Amount", "Status", ""]} minWidth={720}>
            {rows.map((i) => (
              <Row key={i.id}>
                <Cell className="text-[12px]">{i.issuedAt}</Cell>
                <Cell>{i.period}</Cell>
                <Cell className="capitalize">{i.type}</Cell>
                <Cell className={`tabular-nums ${i.amountCents < 0 ? "text-red-700" : ""}`}>
                  {formatEur(i.amountCents)}
                </Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(i.status)}>{i.status}</StatusBadge>
                </Cell>
                <Cell>
                  <DemoAction label="PDF" size="sm" />
                </Cell>
              </Row>
            ))}
          </DataTable>
        </div>
        <Card title="Billing period" description="16–31 July 2026">
          <ul className="space-y-1 text-[13px]">
            <li className="flex justify-between"><span>Gross sales</span><span className="tabular-nums">{formatEur(1345900)}</span></li>
            <li className="flex justify-between"><span>Commission</span><span className="tabular-nums text-red-700">{formatEur(-221000)}</span></li>
            <li className="flex justify-between"><span>Shipping contributions</span><span className="tabular-nums">{formatEur(-2500)}</span></li>
            <li className="flex justify-between"><span>Advertising</span><span className="tabular-nums text-red-700">{formatEur(-18900)}</span></li>
            <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>Expected payout</span><span className="tabular-nums">{formatEur(1104500)}</span></li>
          </ul>
        </Card>
      </div>
    </ManagerShell>
  );
}
