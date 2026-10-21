import { createFileRoute } from "@tanstack/react-router";
import { DataTable, Row, Cell, StatusBadge, Metric, Card, BarChart } from "@/components/demo/shell";

export const Route = createFileRoute("/_authenticated/admin/health")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Platform health — Borvat Admin" },
      { name: "description", content: "Outbox throughput, job queues and gate status for the Borvat platform." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Platform health — Borvat Admin" },
      { property: "og:description", content: "Outbox, jobs and gate status." },
    ],
  }),
  component: AdminHealth,
});

const components = [
  { name: "Outbox dispatcher", state: "healthy", detail: "0 pending older than 5 min" },
  { name: "Order status e-mails", state: "healthy", detail: "12 sent / 24h" },
  { name: "Bol sync (sandbox)", state: "degraded", detail: "Read-only shadow mode" },
  { name: "Manual quote expiry", state: "healthy", detail: "Evaluated at read time" },
  { name: "ACL normalization", state: "attention", detail: "Re-run required after each deploy (R-T21)" },
];

const throughput = [
  { label: "00h", value: 4 },
  { label: "04h", value: 2 },
  { label: "08h", value: 9 },
  { label: "12h", value: 14 },
  { label: "16h", value: 11 },
  { label: "20h", value: 6 },
];

function AdminHealth() {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Components healthy" value="3/5" tone="warn" />
        <Metric label="Outbox pending" value="0" tone="good" />
        <Metric label="Failed jobs (24h)" value="0" tone="good" />
        <Metric label="Last gate run" value="09:14" hint="ACL PASS" />
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DataTable columns={["Component", "State", "Detail"]} minWidth={640}>
          {components.map((c) => (
            <Row key={c.name}>
              <Cell className="font-medium">{c.name}</Cell>
              <Cell>
                <StatusBadge tone={c.state === "healthy" ? "good" : c.state === "degraded" ? "info" : "warn"}>
                  {c.state}
                </StatusBadge>
              </Cell>
              <Cell className="text-[12px]">{c.detail}</Cell>
            </Row>
          ))}
        </DataTable>
        <Card title="Outbox dispatch / 4h">
          <BarChart data={throughput} />
        </Card>
      </div>
    </div>
  );
}
