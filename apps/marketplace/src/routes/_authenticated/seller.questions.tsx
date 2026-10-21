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
  SearchInput,
  Tabs,
  Toolbar,
  DemoAction,
  Drawer,
  KeyValue,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { questionsForStore, type DemoQuestion } from "@/demo/ops";

export const Route = createFileRoute("/_authenticated/seller/questions")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Customer questions — Borvat Seller Manager" },
      { name: "description", content: "Answer routed customer questions within the Borvat service SLA." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Customer questions — Borvat Seller Manager" },
      { property: "og:description", content: "Routed customer questions with SLA timers." },
    ],
  }),
  component: SellerQuestions,
});

function SellerQuestions() {
  const store = storeById(demoActiveStoreId)!;
  const all = questionsForStore(store.id);
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<DemoQuestion | null>(null);

  const rows = all
    .filter((x) => (tab === "all" ? true : x.status === tab))
    .filter((x) => (q ? (x.subject + x.productSku).toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Customer questions"
      subtitle="Questions are relayed by Borvat — you never see customer contact details"
      tabs={
        <Tabs
          tabs={[
            { id: "open", label: "Open", count: all.filter((x) => x.status === "open").length },
            { id: "waiting_customer", label: "Waiting for customer", count: all.filter((x) => x.status === "waiting_customer").length },
            { id: "resolved", label: "Resolved", count: all.filter((x) => x.status === "resolved").length },
            { id: "all", label: "All", count: all.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search subject or SKU…" />
        <span className="ml-auto text-[12px] text-muted-foreground">SLA: reply within 24 hours</span>
      </Toolbar>
      <DataTable
        minWidth={900}
        columns={["Received", "Subject", "Customer", "SKU", "Priority", "Due in", "Status", "Action"]}
      >
        {rows.map((x) => (
          <Row key={x.id} onClick={() => setDetail(x)}>
            <Cell className="text-[12px]">{x.receivedAt}</Cell>
            <Cell className="max-w-[320px] truncate font-medium">{x.subject}</Cell>
            <Cell>{x.customerMasked}</Cell>
            <Cell className="font-mono text-[12px]">{x.productSku}</Cell>
            <Cell>
              <StatusBadge tone={x.priority === "high" ? "bad" : x.priority === "normal" ? "warn" : "neutral"}>
                {x.priority}
              </StatusBadge>
            </Cell>
            <Cell className="tabular-nums">{x.dueIn}</Cell>
            <Cell>
              <StatusBadge tone={toneForStatus(x.status)}>{x.status}</StatusBadge>
            </Cell>
            <Cell>
              <DemoAction label="Answer" size="sm" />
            </Cell>
          </Row>
        ))}
      </DataTable>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.subject ?? ""}
        subtitle={detail ? `${detail.customerMasked} · ${detail.productSku}` : undefined}
        footer={
          <>
            <DemoAction label="Send answer" variant="primary" size="sm" />
            <DemoAction label="Escalate to Borvat" size="sm" />
          </>
        }
      >
        {detail ? (
          <>
            <KeyValue
              items={[
                ["Received", detail.receivedAt],
                ["Priority", detail.priority],
                ["Due in", detail.dueIn],
                ["Status", <StatusBadge tone={toneForStatus(detail.status)}>{detail.status}</StatusBadge>],
              ]}
            />
            <textarea
              readOnly
              rows={4}
              className="w-full rounded-sm border border-border bg-muted/40 p-2 text-[13px]"
              value="Demo answer draft — nothing is submitted from this screen."
            />
          </>
        ) : null}
      </Drawer>
    </ManagerShell>
  );
}
