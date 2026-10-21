import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable, Row, Cell, StatusBadge, toneForStatus, Metric, Card } from "@/components/demo/shell";
import { demoCases, demoConversations } from "@/demo/messages";

export const Route = createFileRoute("/_authenticated/admin/support")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Support oversight — Borvat Admin" },
      { name: "description", content: "Case load across the customer and merchant support channels." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Support oversight — Borvat Admin" },
      { property: "og:description", content: "Support case load overview." },
    ],
  }),
  component: AdminSupport,
});

function AdminSupport() {
  const open = demoCases.filter((c) => c.status !== "resolved");
  const high = demoCases.filter((c) => c.priority === "high");
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open cases" value={String(open.length)} tone="warn" />
        <Metric label="High priority" value={String(high.length)} tone="bad" />
        <Metric label="Conversations" value={String(demoConversations.length)} />
        <Metric label="Unread" value={String(demoConversations.reduce((s, c) => s + c.unread, 0))} />
      </div>
      <DataTable columns={["Case", "Type", "Priority", "Status", "Opened", ""]} minWidth={860}>
        {demoCases.map((c) => (
          <Row key={c.id}>
            <Cell className="max-w-[280px] truncate font-medium">{c.title}</Cell>
            <Cell className="text-[12px] capitalize">{c.type.replace(/_/g, " ")}</Cell>
            <Cell>
              <StatusBadge tone={c.priority === "high" ? "bad" : c.priority === "normal" ? "info" : "neutral"}>
                {c.priority}
              </StatusBadge>
            </Cell>
            <Cell>
              <StatusBadge tone={toneForStatus(c.status)}>{c.status}</StatusBadge>
            </Cell>
            <Cell className="text-[12px]">{c.openedAt}</Cell>
            <Cell>
              <Link to="/support/cases/$caseId" params={{ caseId: c.id }} className="text-[12px] text-brand underline">
                Open case
              </Link>
            </Cell>
          </Row>
        ))}
      </DataTable>
      <Card title="Dual-channel rule">
        <p className="text-[13px] text-muted-foreground">
          Customers only talk to Borvat and merchants only talk to Borvat. There is no direct
          customer ↔ merchant channel; support bridges both sides inside one case.
        </p>
      </Card>
    </div>
  );
}
