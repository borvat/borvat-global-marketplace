import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  Metric,
  Tabs,
  Toolbar,
  SearchInput,
  DemoAction,
} from "@/components/demo/shell";
import { demoOrders } from "@/demo/ops";
import { storeById } from "@/demo/companies";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Orders — Borvat Admin" },
      { name: "description", content: "Cross-merchant order flow with status, hand-over and label state." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Orders — Borvat Admin" },
      { property: "og:description", content: "Cross-merchant order flow." },
    ],
  }),
  component: AdminOrders,
});

function AdminOrders() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const rows = demoOrders
    .filter((o) => (tab === "all" ? true : o.status === tab))
    .filter((o) => (q ? (o.orderNumber + o.sku + o.productTitle).toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Orders (demo)" value={String(demoOrders.length)} />
        <Metric label="Awaiting hand-over" value={String(demoOrders.filter((o) => o.labelStatus !== "handed_over" && o.status !== "cancelled").length)} tone="warn" />
        <Metric label="Returns" value={String(demoOrders.filter((o) => o.status === "return").length)} tone="bad" />
        <Metric label="Value" value={formatEur(demoOrders.reduce((s, o) => s + o.amountCents, 0))} />
      </div>
      <Tabs
        tabs={[
          { id: "all", label: "All", count: demoOrders.length },
          { id: "new", label: "New" },
          { id: "processing", label: "Processing" },
          { id: "shipped", label: "Shipped" },
          { id: "delivered", label: "Delivered" },
          { id: "return", label: "Returns" },
          { id: "cancelled", label: "Cancelled" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search order, SKU or title…" />
      </Toolbar>
      <DataTable columns={["Order", "Store", "Product", "Qty", "Amount", "Hand-over", "Label", "Status", ""]} minWidth={1040}>
        {rows.map((o) => (
          <Row key={o.id}>
            <Cell className="font-mono text-[12px]">{o.orderNumber}</Cell>
            <Cell className="text-[12px]">{storeById(o.storeId)?.name ?? o.storeId}</Cell>
            <Cell className="max-w-[260px] truncate">{o.productTitle}</Cell>
            <Cell className="tabular-nums">{o.quantity}</Cell>
            <Cell className="tabular-nums">{formatEur(o.amountCents)}</Cell>
            <Cell className="text-[12px]">{o.handoverBy}</Cell>
            <Cell>
              <StatusBadge tone={toneForStatus(o.labelStatus)}>{o.labelStatus.replace(/_/g, " ")}</StatusBadge>
            </Cell>
            <Cell>
              <StatusBadge tone={toneForStatus(o.status)}>{o.status}</StatusBadge>
            </Cell>
            <Cell>
              <DemoAction label="Inspect" size="sm" />
            </Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}
