import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  SearchInput,
  FilterSelect,
  Tabs,
  Toolbar,
  DemoAction,
  Drawer,
  KeyValue,
  Pagination,
  EmptyState,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { ordersForStore, type DemoOrder } from "@/demo/ops";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/order-desk")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Order desk — Borvat Seller Manager" },
      { name: "description", content: "Handle new, processing, shipped, cancelled orders and returns from one desk." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Order desk — Borvat Seller Manager" },
      { property: "og:description", content: "Operational order handling for Borvat sellers." },
    ],
  }),
  component: OrderDesk,
});

const TABS = [
  { id: "new", label: "New" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "return", label: "Returns" },
  { id: "invoices", label: "Invoice requests" },
];

function matchTab(o: DemoOrder, tab: string) {
  if (tab === "invoices") return o.invoiceRequested;
  return o.status === tab;
}

const labelTone = { not_created: "bad", created: "warn", handed_over: "good" } as const;

function OrderDesk() {
  const store = storeById(demoActiveStoreId)!;
  const all = ordersForStore(store.id);
  const [tab, setTab] = useState("new");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<DemoOrder | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((o) => matchTab(o, tab))
      .filter((o) => (country === "all" ? true : o.country === country))
      .filter((o) =>
        needle ? (o.orderNumber + o.sku + o.productTitle + o.customerMasked).toLowerCase().includes(needle) : true,
      );
  }, [all, tab, q, country]);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Orders"
      subtitle={`${all.length} orders · handover deadlines in local time`}
      actions={
        <>
          <DemoAction label="Download packing slips" size="sm" />
          <DemoAction label="Create labels" size="sm" variant="primary" />
        </>
      }
      tabs={
        <Tabs
          tabs={TABS.map((t) => ({ ...t, count: all.filter((o) => matchTab(o, t.id)).length }))}
          active={tab}
          onChange={(id) => {
            setTab(id);
            setSelected([]);
          }}
        />
      }
    >
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search order number, SKU or customer…" />
        <FilterSelect
          label="Country"
          value={country}
          onChange={setCountry}
          options={[
            { value: "all", label: "All" },
            { value: "NL", label: "NL" },
            { value: "BE", label: "BE" },
          ]}
        />
        <span className="ml-auto flex items-center gap-1.5">
          {selected.length > 0 ? (
            <>
              <span className="text-[12px] text-muted-foreground">{selected.length} selected</span>
              <DemoAction label="Create shipping labels" size="sm" />
              <DemoAction label="Print packing slips" size="sm" />
              <DemoAction label="Mark handed over" size="sm" />
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground">Select rows for bulk handling</span>
          )}
        </span>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState title="No orders in this tab" hint="Nothing needs your attention here right now." />
      ) : (
        <>
          <DataTable
            minWidth={1240}
            columns={[
              <input
                key="sel"
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
              />,
              "Order",
              "Customer",
              "Product",
              "Qty",
              "Amount",
              "Shipping method",
              "Hand over by",
              "Label",
              "Packing slip",
              "Status",
              "Action",
            ]}
          >
            {rows.map((o) => (
              <Row key={o.id} onClick={() => setDetail(o)} selected={selected.includes(o.id)}>
                <Cell>
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() =>
                      setSelected((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))
                    }
                  />
                </Cell>
                <Cell className="font-mono text-[12px]">{o.orderNumber}</Cell>
                <Cell>{o.customerMasked}</Cell>
                <Cell className="max-w-[240px] truncate">
                  {o.productTitle}
                  <span className="block font-mono text-[11px] text-muted-foreground">{o.sku}</span>
                </Cell>
                <Cell className="tabular-nums">{o.quantity}</Cell>
                <Cell className="tabular-nums">{formatEur(o.amountCents)}</Cell>
                <Cell className="text-[12px]">{o.shippingMethod}</Cell>
                <Cell className="text-[12px]">{o.handoverBy}</Cell>
                <Cell>
                  <StatusBadge tone={labelTone[o.labelStatus]}>{o.labelStatus.replace("_", " ")}</StatusBadge>
                </Cell>
                <Cell>{o.packingSlip ? "Ready" : "—"}</Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(o.status)}>{o.status}</StatusBadge>
                </Cell>
                <Cell>
                  <DemoAction label={o.status === "new" ? "Process" : "Open"} size="sm" />
                </Cell>
              </Row>
            ))}
          </DataTable>
          <Pagination total={rows.length} />
        </>
      )}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.orderNumber ?? ""}
        subtitle={detail ? `${detail.customerMasked} · placed ${detail.placedAt}` : undefined}
        footer={
          <>
            <DemoAction label="Create label" variant="primary" size="sm" />
            <DemoAction label="Print packing slip" size="sm" />
            <DemoAction label="Cancel order" size="sm" />
          </>
        }
      >
        {detail ? (
          <>
            <KeyValue
              items={[
                ["Status", <StatusBadge tone={toneForStatus(detail.status)}>{detail.status}</StatusBadge>],
                ["Product", `${detail.productTitle} (${detail.sku})`],
                ["Quantity", String(detail.quantity)],
                ["Amount incl. VAT", formatEur(detail.amountCents)],
                ["Shipping method", detail.shippingMethod],
                ["Hand over by", detail.handoverBy],
                ["Destination", detail.country],
                ["Invoice requested", detail.invoiceRequested ? "Yes" : "No"],
              ]}
            />
            <div className="rounded-sm border border-border p-2 text-[12px] text-muted-foreground">
              Customer contact always runs through Borvat Customer Service. Sellers never message
              customers directly.
            </div>
          </>
        ) : null}
      </Drawer>
    </ManagerShell>
  );
}
