import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  Metric,
  Card,
  Tabs,
  Toolbar,
  SearchInput,
  DemoAction,
} from "@/components/demo/shell";
import { demoActiveStoreId, storeById } from "@/demo/companies";
import { demoReviews } from "@/demo/ops";

export const Route = createFileRoute("/_authenticated/seller/reviews")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reviews — Borvat Seller Manager" },
      { name: "description", content: "Customer ratings and reviews for your Borvat listings." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Reviews — Borvat Seller Manager" },
      { property: "og:description", content: "Ratings and review responses." },
    ],
  }),
  component: SellerReviews,
});

function SellerReviews() {
  const store = storeById(demoActiveStoreId)!;
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const avg = (demoReviews.reduce((s, r) => s + r.rating, 0) / demoReviews.length).toFixed(1);
  const rows = demoReviews
    .filter((r) =>
      tab === "all" ? true : tab === "unanswered" ? !r.answered : tab === "low" ? r.rating <= 3 : true,
    )
    .filter((r) => (q ? (r.title + r.body + r.productSku).toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Reviews"
      subtitle="General rating and individual product reviews"
      tabs={
        <Tabs
          tabs={[
            { id: "all", label: "All", count: demoReviews.length },
            { id: "unanswered", label: "Unanswered", count: demoReviews.filter((r) => !r.answered).length },
            { id: "low", label: "3 stars or lower", count: demoReviews.filter((r) => r.rating <= 3).length },
          ]}
          active={tab}
          onChange={setTab}
        />
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="General rating" value={`${avg} / 5`} tone="good" />
        <Metric label="Reviews (90 days)" value={String(demoReviews.length)} />
        <Metric label="Unanswered" value={String(demoReviews.filter((r) => !r.answered).length)} tone="warn" />
        <Metric label="Low ratings" value={String(demoReviews.filter((r) => r.rating <= 3).length)} tone="bad" />
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Search review text or SKU…" />
          </Toolbar>
          <DataTable columns={["Date", "SKU", "Rating", "Review", "Author", "Answered", ""]} minWidth={840}>
            {rows.map((r) => (
              <Row key={r.id}>
                <Cell className="text-[12px]">{r.at}</Cell>
                <Cell className="font-mono text-[12px]">{r.productSku}</Cell>
                <Cell className="whitespace-nowrap">{"★".repeat(r.rating)}<span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span></Cell>
                <Cell className="max-w-[360px]">
                  <span className="font-medium">{r.title}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{r.body}</span>
                </Cell>
                <Cell className="text-[12px]">{r.author}</Cell>
                <Cell>
                  <StatusBadge tone={r.answered ? "good" : "warn"}>{r.answered ? "yes" : "no"}</StatusBadge>
                </Cell>
                <Cell>
                  <DemoAction label="Respond" size="sm" />
                </Cell>
              </Row>
            ))}
          </DataTable>
        </div>
        <Card title="Rating distribution">
          <ul className="space-y-1 text-[13px]">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = demoReviews.filter((r) => r.rating === star).length;
              return (
                <li key={star} className="flex items-center gap-2">
                  <span className="w-6 text-muted-foreground">{star}★</span>
                  <span className="h-2 flex-1 rounded-sm bg-muted">
                    <span className="block h-2 rounded-sm bg-brand/80" style={{ width: `${(n / demoReviews.length) * 100}%` }} />
                  </span>
                  <span className="w-5 text-right tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </ManagerShell>
  );
}
