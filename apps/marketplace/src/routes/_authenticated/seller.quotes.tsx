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
  Tabs,
  Toolbar,
  SearchInput,
  DemoAction,
  Drawer,
  KeyValue,
  Card,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { quotesForStore, type DemoQuoteRequest } from "@/demo/quotes";
import { productById } from "@/demo/products";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/quotes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Manual quotes — Borvat Seller Manager" },
      { name: "description", content: "Handle manual shipping quote requests, offers, expiry and acceptance." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Manual quotes — Borvat Seller Manager" },
      { property: "og:description", content: "Manual shipping quote workflow." },
    ],
  }),
  component: SellerQuotes,
});

const TABS = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Requested" },
  { id: "awaiting_offer", label: "Under review" },
  { id: "offered", label: "Offered" },
  { id: "accepted", label: "Accepted" },
  { id: "expired", label: "Expired" },
];

function SellerQuotes() {
  const store = storeById(demoActiveStoreId)!;
  const all = quotesForStore(store.id);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<DemoQuoteRequest | null>(null);

  const rows = all
    .filter((x) => (tab === "all" ? true : x.status === tab))
    .filter((x) => (q ? (x.id + x.destination.city + x.destination.postcodeArea).toLowerCase().includes(q.toLowerCase()) : true));

  const latestOffer = (r: DemoQuoteRequest) =>
    [...r.offers].sort((a, b) => b.version - a.version)[0];

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Manual quotes"
      subtitle="Bulky and pallet shipments that need a priced offer before checkout"
      actions={<DemoAction label="New offer" size="sm" variant="primary" />}
      tabs={
        <Tabs
          tabs={TABS.map((t) => ({
            ...t,
            count: t.id === "all" ? all.length : all.filter((x) => x.status === t.id).length,
          }))}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search quote ID, city or postcode area…" />
        <span className="ml-auto text-[12px] text-muted-foreground">
          Offers are versioned; a new revision supersedes the previous one
        </span>
      </Toolbar>

      <DataTable
        minWidth={1240}
        columns={[
          "Quote ID",
          "Destination area",
          "Shipment form",
          "Items",
          "Packages",
          "Origin",
          "Offered price",
          "Delivery terms",
          "Expiry",
          "Status",
          "Action",
        ]}
      >
        {rows.map((r) => {
          const offer = latestOffer(r);
          const product = productById(r.productId);
          return (
            <Row key={r.id} onClick={() => setDetail(r)}>
              <Cell className="font-mono text-[12px]">
                {r.id}
                <span className="block text-[11px] text-muted-foreground">rev {r.revision}</span>
              </Cell>
              <Cell>
                {r.destination.city}
                <span className="block text-[11px] text-muted-foreground">
                  {r.destination.postcodeArea} · {r.destination.country}
                </span>
              </Cell>
              <Cell className="text-[12px]">{r.packages.length > 1 ? "Multi-package" : "Single package"}</Cell>
              <Cell className="max-w-[200px] truncate text-[12px]">
                {r.quantity}× {product?.sku ?? r.productId}
              </Cell>
              <Cell className="tabular-nums">{r.packages.reduce((s, p) => s + p.qty, 0)}</Cell>
              <Cell className="text-[12px]">{product?.fulfillmentOrigin ?? "—"}</Cell>
              <Cell className="tabular-nums">{offer ? formatEur(offer.priceCents) : "—"}</Cell>
              <Cell className="max-w-[170px] truncate text-[12px]">{offer?.etaText ?? "—"}</Cell>
              <Cell className="text-[12px]">{offer?.expiresAt ?? "—"}</Cell>
              <Cell>
                <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
              </Cell>
              <Cell>
                <DemoAction label="Open" size="sm" />
              </Cell>
            </Row>
          );
        })}
      </DataTable>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.id} · revision ${detail.revision}` : ""}
        subtitle={detail ? `${detail.destination.city} (${detail.destination.postcodeArea})` : undefined}
        footer={
          <>
            <DemoAction label="Create offer" variant="primary" size="sm" />
            <DemoAction label="Request more info" size="sm" />
            <DemoAction label="Cancel request" size="sm" />
          </>
        }
      >
        {detail ? (
          <>
            <KeyValue
              items={[
                ["Status", <StatusBadge tone={toneForStatus(detail.status)}>{detail.status}</StatusBadge>],
                ["Submitted", detail.submittedAt],
                ["Family", detail.familyId],
                ["Product", `${detail.quantity}× ${productById(detail.productId)?.title ?? detail.productId}`],
                ["Destination", `${detail.destination.label} · ${detail.destination.city}`],
                ["Access notes", detail.destination.accessNotes],
              ]}
            />
            <Card title="Packages">
              <DataTable columns={["Label", "L×W×H", "Weight", "Qty"]} minWidth={420}>
                {detail.packages.map((p) => (
                  <Row key={p.id}>
                    <Cell>{p.label}</Cell>
                    <Cell className="tabular-nums">
                      {p.lengthCm}×{p.widthCm}×{p.heightCm} cm
                    </Cell>
                    <Cell className="tabular-nums">{p.weightKg} kg</Cell>
                    <Cell className="tabular-nums">{p.qty}</Cell>
                  </Row>
                ))}
              </DataTable>
            </Card>
            <Card title="Offer history">
              <DataTable columns={["v", "Price", "Carrier", "ETA", "Expires", "Status"]} minWidth={520}>
                {[...detail.offers]
                  .sort((a, b) => b.version - a.version)
                  .map((o) => (
                    <Row key={o.id}>
                      <Cell className="tabular-nums">{o.version}</Cell>
                      <Cell className="tabular-nums">{formatEur(o.priceCents)}</Cell>
                      <Cell className="text-[12px]">{o.carrier}</Cell>
                      <Cell className="text-[12px]">{o.etaText}</Cell>
                      <Cell className="text-[12px]">{o.expiresAt}</Cell>
                      <Cell>
                        <StatusBadge tone={toneForStatus(o.status)}>{o.status}</StatusBadge>
                      </Cell>
                    </Row>
                  ))}
              </DataTable>
            </Card>
            {detail.acceptedTerms ? (
              <Card title="Accepted terms">
                <KeyValue
                  items={[
                    ["Offer", detail.acceptedTerms.offerId],
                    ["Accepted at", detail.acceptedTerms.acceptedAt],
                    ["Price", formatEur(detail.acceptedTerms.priceCents)],
                    ["ETA", detail.acceptedTerms.etaText],
                    ["Note", detail.acceptedTerms.note],
                  ]}
                />
              </Card>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </ManagerShell>
  );
}
