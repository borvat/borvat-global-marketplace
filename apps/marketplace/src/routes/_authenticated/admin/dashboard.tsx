import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Metric,
  Card,
  StatusBadge,
  toneForStatus,
  DataTable,
  Row,
  Cell,
  BarChart,
  DemoAction,
} from "@/components/demo/shell";
import { demoCompanies, demoStores } from "@/demo/companies";
import { demoProducts } from "@/demo/products";
import { demoQuoteRequests } from "@/demo/quotes";
import { demoCases } from "@/demo/messages";
import { demoOrders, demoOrdersSeries, demoRevenueSeries } from "@/demo/ops";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Platform dashboard — Borvat Admin" },
      { name: "description", content: "Cross-merchant overview of stores, listings, orders, quotes and gates." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Platform dashboard — Borvat Admin" },
      { property: "og:description", content: "Cross-merchant platform overview." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const openCases = demoCases.filter((c) => c.status !== "resolved");
  const attention = demoStores.filter((s) => s.verification !== "verified" || s.status !== "active");
  const gmv = demoOrders.reduce((s, o) => s + o.amountCents, 0);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="Companies" value={String(demoCompanies.length)} to="/admin/companies" />
        <Metric label="Stores" value={String(demoStores.length)} to="/admin/stores" />
        <Metric label="Listings" value={String(demoProducts.length)} to="/admin/products" />
        <Metric label="Open orders" value={String(demoOrders.length)} to="/admin/orders" />
        <Metric label="GMV (demo)" value={formatEur(gmv)} />
        <Metric label="Manual quotes" value={String(demoQuoteRequests.length)} to="/admin/quotes" />
        <Metric label="Open cases" value={String(openCases.length)} tone="warn" to="/admin/support" />
        <Metric label="ACL gate" value="PASS" hint="58/58" tone="good" to="/admin/security" />
      </div>

      <div className="grid gap-2 xl:grid-cols-3">
        <Card title="Platform revenue per week" className="xl:col-span-2">
          <BarChart data={demoRevenueSeries} format={(v) => formatEur(v * 100)} />
        </Card>
        <Card title="Orders per week">
          <BarChart data={demoOrdersSeries} />
        </Card>
      </div>

      <div className="grid gap-2 xl:grid-cols-3">
        <Card
          title="Stores requiring attention"
          description={`${attention.length} of ${demoStores.length} stores`}
          action={<Link to="/admin/companies" className="text-[12px] text-brand underline">Open</Link>}
        >
          <DataTable columns={["Store", "Status", "Verification", ""]} minWidth={0}>
            {attention.map((s) => (
              <Row key={s.id}>
                <Cell className="max-w-[180px] truncate font-medium">{s.name}</Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge>
                </Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(s.verification)}>{s.verification}</StatusBadge>
                </Cell>
                <Cell>
                  <DemoAction label="Review" size="sm" />
                </Cell>
              </Row>
            ))}
          </DataTable>
        </Card>

        <Card
          title="Support cases"
          description="Customer and merchant channels"
          action={<Link to="/support/queue" className="text-[12px] text-brand underline">Queue</Link>}
        >
          <DataTable columns={["Case", "Priority", "Status"]} minWidth={0}>
            {demoCases.map((c) => (
              <Row key={c.id}>
                <Cell className="max-w-[200px] truncate">{c.title}</Cell>
                <Cell>
                  <StatusBadge tone={c.priority === "high" ? "bad" : c.priority === "normal" ? "info" : "neutral"}>
                    {c.priority}
                  </StatusBadge>
                </Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge>
                </Cell>
              </Row>
            ))}
          </DataTable>
        </Card>

        <Card title="Governance gates" action={<Link to="/admin/security" className="text-[12px] text-brand underline">Details</Link>}>
          <ul className="space-y-1.5 text-[13px]">
            <li className="flex items-center justify-between gap-2"><span>ACL gate</span><StatusBadge tone="good">PASS</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>place_order exposure</span><StatusBadge tone="good">fail-closed</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>Bol live activation</span><StatusBadge tone="warn">blocked</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>Seller payouts live</span><StatusBadge tone="warn">blocked</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>Open residual risks</span><StatusBadge tone="warn">4</StatusBadge></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
