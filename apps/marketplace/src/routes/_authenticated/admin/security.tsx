import { createFileRoute } from "@tanstack/react-router";
import { DemoBanner, Card, DataTable, Row, Cell, StatusBadge } from "@/components/demo/shell";

export const Route = createFileRoute("/_authenticated/admin/security")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Security & risks (demo) — Borvat Admin" },
      { name: "description", content: "Demo summary of ACL gate status, governance gates and residual risks." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Security & risks (demo) — Borvat Admin" },
      { property: "og:description", content: "Demo governance and risk summary." },
    ],
  }),
  component: AdminSecurity,
});

const gates = [
  { name: "ACL gate (critical routines & tables)", state: "PASS", detail: "58/58 assertions" },
  { name: "place_order exposure", state: "PASS", detail: "Fail-closed — no application role grants" },
  { name: "Bol live activation", state: "BLOCKED", detail: "Requires owner approval + canary + kill-switch drill" },
  { name: "Stripe live / seller payouts", state: "BLOCKED", detail: "Not authorised in Phase 5" },
  { name: "Clean-room migration replay", state: "PASS", detail: "Zero structural delta" },
];

const risks = [
  { id: "R-T21", title: "Post-deploy ACL re-grant drift", severity: "high", status: "open", note: "Every deploy needs ACL normalization + final gate." },
  { id: "R-Q1", title: "Advisory lock binds guard-path writers only", severity: "medium", status: "open", note: "Direct writes bypassing guards are not serialized." },
  { id: "R-Q2", title: "Single-family write queuing", severity: "low", status: "open", note: "Concurrent writers on one family queue behind the lock." },
  { id: "R-T9", title: "Manual quote expiry evaluated at read time", severity: "low", status: "accepted", note: "No cron authorised yet." },
];

function tone(state: string) {
  if (state === "PASS") return "good" as const;
  if (state === "BLOCKED") return "warn" as const;
  return "neutral" as const;
}

function AdminSecurity() {
  return (
    <div className="space-y-4">
      <DemoBanner note="Demo governance summary. Figures mirror the last recorded verification run, not a live query." />

      <Card title="Gates">
        <DataTable columns={["Gate", "State", "Detail"]}>
          {gates.map((g) => (
            <Row key={g.name}>
              <Cell className="font-medium">{g.name}</Cell>
              <Cell>
                <StatusBadge tone={tone(g.state)}>{g.state}</StatusBadge>
              </Cell>
              <Cell className="text-xs">{g.detail}</Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <Card title="Residual risks">
        <DataTable columns={["ID", "Risk", "Severity", "Status", "Note"]}>
          {risks.map((r) => (
            <Row key={r.id}>
              <Cell className="font-mono text-xs">{r.id}</Cell>
              <Cell className="font-medium">{r.title}</Cell>
              <Cell>
                <StatusBadge tone={r.severity === "high" ? "bad" : r.severity === "medium" ? "warn" : "neutral"}>
                  {r.severity}
                </StatusBadge>
              </Cell>
              <Cell>
                <StatusBadge tone={r.status === "open" ? "warn" : "good"}>{r.status}</StatusBadge>
              </Cell>
              <Cell className="text-xs">{r.note}</Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <Card title="Principles enforced">
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Roles live in a dedicated role table; never on profiles.</li>
          <li>Inventory and money move through append-only ledgers only.</li>
          <li>Channel secrets are never stored in plaintext.</li>
          <li>No hardcoding for the founding merchants — a seventh tenant onboards without code change.</li>
        </ul>
      </Card>
    </div>
  );
}
