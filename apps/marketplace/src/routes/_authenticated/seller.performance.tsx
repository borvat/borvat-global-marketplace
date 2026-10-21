import { createFileRoute } from "@tanstack/react-router";
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
  DemoAction,
  BarChart,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { demoServiceStandards, demoOrdersSeries } from "@/demo/ops";

export const Route = createFileRoute("/_authenticated/seller/performance")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Performance overview — Borvat Seller Manager" },
      { name: "description", content: "Service standards, norms and trends for your Borvat shop." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Performance overview — Borvat Seller Manager" },
      { property: "og:description", content: "Service standards and norms." },
    ],
  }),
  component: SellerPerformance,
});

function SellerPerformance() {
  const store = storeById(demoActiveStoreId)!;
  const breached = demoServiceStandards.filter((s) => s.status !== "ok");
  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Performance overview"
      subtitle="Rolling 30-day measurement window"
      actions={<DemoAction label="Export report" size="sm" />}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Standards met" value={`${demoServiceStandards.length - breached.length}/${demoServiceStandards.length}`} tone={breached.length ? "warn" : "good"} />
        <Metric label="Account status" value="Good standing" tone="good" />
        <Metric label="At risk" value={String(breached.filter((b) => b.status === "at_risk").length)} tone="warn" />
        <Metric label="Breached" value={String(breached.filter((b) => b.status === "breached").length)} tone="bad" />
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DataTable columns={["Service standard", "Your score", "Norm", "Trend", "Status", ""]} minWidth={760}>
          {demoServiceStandards.map((s) => (
            <Row key={s.id}>
              <Cell className="font-medium">{s.metric}</Cell>
              <Cell className="tabular-nums">{s.score}</Cell>
              <Cell className="text-[12px] text-muted-foreground">{s.norm}</Cell>
              <Cell>{s.trend === "up" ? "▲" : s.trend === "down" ? "▼" : "—"}</Cell>
              <Cell>
                <StatusBadge tone={toneForStatus(s.status)}>{s.status}</StatusBadge>
              </Cell>
              <Cell>
                <DemoAction label="Details" size="sm" />
              </Cell>
            </Row>
          ))}
        </DataTable>
        <div className="space-y-2">
          <Card title="Orders per week">
            <BarChart data={demoOrdersSeries} />
          </Card>
          <Card title="Improvement actions">
            <ul className="list-disc space-y-1 pl-4 text-[13px]">
              <li>Answer customer questions within 24h to lift response rate above 90%.</li>
              <li>Register return handling within 2 working days.</li>
              <li>Keep hand-over deadlines to protect on-time delivery.</li>
            </ul>
          </Card>
        </div>
      </div>
    </ManagerShell>
  );
}
