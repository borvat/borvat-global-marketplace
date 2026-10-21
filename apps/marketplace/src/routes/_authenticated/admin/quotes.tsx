import { createFileRoute } from "@tanstack/react-router";
import {
  DemoBanner,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  Card,
} from "@/components/demo/shell";
import { demoQuoteRequests } from "@/demo/quotes";
import { storeById } from "@/demo/companies";
import { productById } from "@/demo/products";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/quotes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Manual quotes (demo) — Borvat Admin" },
      { name: "description", content: "Demo cross-merchant view of manual shipping quote families." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Manual quotes (demo) — Borvat Admin" },
      { property: "og:description", content: "Demo manual shipping quote oversight." },
    ],
  }),
  component: AdminQuotes,
});

function AdminQuotes() {
  return (
    <div className="space-y-4">
      <DemoBanner note="Demo quote families. Acceptance is serialized per family in production." />
      <DataTable
        columns={["Request", "Family / rev", "Store", "Product", "Destination", "Status", "Offers", "Accepted"]}
      >
        {demoQuoteRequests.map((q) => (
          <Row key={q.id}>
            <Cell className="font-mono text-xs">{q.id}</Cell>
            <Cell className="text-xs">
              {q.familyId} · rev {q.revision}
            </Cell>
            <Cell className="text-xs">{storeById(q.storeId)?.name ?? q.storeId}</Cell>
            <Cell className="max-w-[200px] truncate text-xs">
              {productById(q.productId)?.title ?? q.productId}
            </Cell>
            <Cell className="text-xs">
              {q.destination.city} {q.destination.country}
            </Cell>
            <Cell>
              <StatusBadge tone={toneForStatus(q.status)}>{q.status}</StatusBadge>
            </Cell>
            <Cell>{q.offers.length}</Cell>
            <Cell className="text-xs">
              {q.acceptedTerms ? formatEur(q.acceptedTerms.priceCents) : "—"}
            </Cell>
          </Row>
        ))}
      </DataTable>

      <Card title="Offer version history">
        <ul className="space-y-3 text-sm">
          {demoQuoteRequests.map((q) => (
            <li key={q.id}>
              <div className="font-medium">
                {q.id} <span className="text-xs text-muted-foreground">({q.familyId})</span>
              </div>
              {q.offers.length === 0 ? (
                <div className="text-xs text-muted-foreground">No offers yet.</div>
              ) : (
                <ul className="ml-4 list-disc text-muted-foreground">
                  {q.offers.map((o) => (
                    <li key={o.id}>
                      v{o.version} · {formatEur(o.priceCents)} · {o.carrier} · {o.status} · expires{" "}
                      {o.expiresAt}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
