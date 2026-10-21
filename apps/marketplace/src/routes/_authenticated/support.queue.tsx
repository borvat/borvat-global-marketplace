import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ManagerShell,
  SUPPORT_NAV,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  Metric,
  Tabs,
  Toolbar,
  SearchInput,
} from "@/components/demo/shell";
import { demoCases } from "@/demo/messages";

export const Route = createFileRoute("/_authenticated/support/queue")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Case queue — Borvat Customer Service" },
      { name: "description", content: "Prioritised support case queue across customer and merchant channels." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Case queue — Borvat Customer Service" },
      { property: "og:description", content: "Prioritised support case queue." },
    ],
  }),
  component: SupportQueue,
});

function SupportQueue() {
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const rows = demoCases
    .filter((c) => (tab === "all" ? true : tab === "open" ? c.status !== "resolved" : c.status === tab))
    .filter((c) => (q ? (c.title + c.summary).toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <ManagerShell
      workspace="support"
      navTitle="Borvat Customer Service"
      shopName="All channels"
      nav={SUPPORT_NAV}
      title="Case queue"
      subtitle="Dual-channel bridge — customer ↔ Borvat ↔ merchant"
      tabs={
        <Tabs
          tabs={[
            { id: "open", label: "Open", count: demoCases.filter((c) => c.status !== "resolved").length },
            { id: "waiting_customer", label: "Waiting on customer" },
            { id: "waiting_merchant", label: "Waiting on merchant" },
            { id: "resolved", label: "Resolved" },
            { id: "all", label: "All", count: demoCases.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open cases" value={String(demoCases.filter((c) => c.status !== "resolved").length)} tone="warn" />
        <Metric label="High priority" value={String(demoCases.filter((c) => c.priority === "high").length)} tone="bad" />
        <Metric label="Waiting on merchant" value={String(demoCases.filter((c) => c.status === "waiting_merchant").length)} />
        <Metric label="Resolved" value={String(demoCases.filter((c) => c.status === "resolved").length)} tone="good" />
      </div>
      <div className="mt-2">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search case title or summary…" />
        </Toolbar>
        <DataTable columns={["Case", "Type", "Priority", "Status", "Opened", ""]} minWidth={900}>
          {rows.map((c) => (
            <Row key={c.id}>
              <Cell className="max-w-[300px] truncate font-medium">{c.title}</Cell>
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
                  Open
                </Link>
              </Cell>
            </Row>
          ))}
        </DataTable>
      </div>
    </ManagerShell>
  );
}
