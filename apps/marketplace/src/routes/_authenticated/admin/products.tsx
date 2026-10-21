import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  DemoBanner,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  SearchInput,
  Tabs,
  EmptyState,
} from "@/components/demo/shell";
import { demoProducts } from "@/demo/products";
import { storeById } from "@/demo/companies";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/products")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Listings (demo) — Borvat Admin" },
      { name: "description", content: "Demo cross-merchant listing inspection with publication state." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Listings (demo) — Borvat Admin" },
      { property: "og:description", content: "Demo cross-merchant listing overview." },
    ],
  }),
  component: AdminProducts,
});

const TABS = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "review", label: "In review" },
  { id: "draft", label: "Draft" },
  { id: "unpublished", label: "Unpublished" },
];

function AdminProducts() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      demoProducts
        .filter((p) => (tab === "all" ? true : p.publicationState === tab))
        .filter((p) =>
          q.trim() === ""
            ? true
            : (p.title + p.sku + p.ean).toLowerCase().includes(q.trim().toLowerCase()),
        ),
    [tab, q],
  );

  return (
    <div className="space-y-4">
      <DemoBanner note="Demo cross-merchant listing inspection. Prices include VAT; shipping is separate." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search title, SKU or EAN…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No listings match this filter" />
      ) : (
        <DataTable columns={["Store", "Product", "SKU", "Price incl. VAT", "Stock", "State", "Updated"]}>
          {rows.map((p) => (
            <Row key={p.id}>
              <Cell className="text-xs">{storeById(p.storeId)?.name ?? p.storeId}</Cell>
              <Cell className="max-w-[260px] truncate">{p.title}</Cell>
              <Cell className="font-mono text-xs">{p.sku}</Cell>
              <Cell>{formatEur(p.priceCents)}</Cell>
              <Cell>{p.stockAvailable}</Cell>
              <Cell>
                <StatusBadge tone={toneForStatus(p.publicationState)}>{p.publicationState}</StatusBadge>
              </Cell>
              <Cell className="text-xs">{p.updatedAt}</Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </div>
  );
}
