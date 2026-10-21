import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DataTable,
  Row,
  Cell,
  StatusBadge,
  Metric,
  Toolbar,
  SearchInput,
  FilterSelect,
} from "@/components/demo/shell";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Audit trail — Borvat Admin" },
      { name: "description", content: "Append-only platform audit events for governance review." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Audit trail — Borvat Admin" },
      { property: "og:description", content: "Append-only platform audit events." },
    ],
  }),
  component: AdminAudit,
});

const events = [
  { at: "2026-07-26 09:14", actor: "owner@borvat.demo", action: "acl_gate.run", target: "critical routines", outcome: "PASS" },
  { at: "2026-07-26 08:55", actor: "system", action: "migration.apply", target: "m1b0n_acl_normalization", outcome: "PASS" },
  { at: "2026-07-25 21:03", actor: "support1@borvat.demo", action: "case.status_change", target: "case_1001", outcome: "waiting_customer" },
  { at: "2026-07-25 17:40", actor: "owner@vandenberg.demo", action: "quote_offer.publish", target: "qro_204 v2", outcome: "published" },
  { at: "2026-07-25 12:11", actor: "system", action: "outbox.dispatch", target: "order_status_email", outcome: "delivered" },
  { at: "2026-07-24 19:26", actor: "owner@borvat.demo", action: "bol_channel.mode_check", target: "sandbox", outcome: "blocked" },
];

function AdminAudit() {
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const rows = events
    .filter((e) => (actor ? e.actor === actor : true))
    .filter((e) => (q ? (e.action + e.target).toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Events (24h)" value={String(events.length)} />
        <Metric label="Gate runs" value="1" tone="good" />
        <Metric label="Blocked actions" value="1" tone="warn" />
        <Metric label="Retention" value="Append-only" />
      </div>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search action or target…" />
        <FilterSelect
          label="Actor"
          value={actor}
          onChange={setActor}
          options={[
            { value: "", label: "All actors" },
            ...Array.from(new Set(events.map((e) => e.actor))).map((a) => ({ value: a, label: a })),
          ]}
        />
      </Toolbar>
      <DataTable columns={["Timestamp", "Actor", "Action", "Target", "Outcome"]} minWidth={880}>
        {rows.map((e, i) => (
          <Row key={i}>
            <Cell className="font-mono text-[12px]">{e.at}</Cell>
            <Cell className="text-[12px]">{e.actor}</Cell>
            <Cell className="font-mono text-[12px]">{e.action}</Cell>
            <Cell className="text-[12px]">{e.target}</Cell>
            <Cell>
              <StatusBadge tone={e.outcome === "PASS" || e.outcome === "delivered" || e.outcome === "published" ? "good" : e.outcome === "blocked" ? "warn" : "neutral"}>
                {e.outcome}
              </StatusBadge>
            </Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}
