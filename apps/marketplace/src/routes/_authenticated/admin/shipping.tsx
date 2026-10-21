import { createFileRoute } from "@tanstack/react-router";
import {
  DemoBanner,
  Card,
  DataTable,
  Row,
  Cell,
  StatusBadge,
} from "@/components/demo/shell";
import {
  demoFulfillmentOrigins,
  demoShippingProfiles,
  demoRateCards,
  demoTransitProfiles,
  demoDeliveryPromises,
} from "@/demo/shipping";
import { storeById } from "@/demo/companies";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/shipping")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Shipping configuration (demo) — Borvat Admin" },
      { name: "description", content: "Demo platform view of origins, rate cards and transit profiles." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Shipping configuration (demo) — Borvat Admin" },
      { property: "og:description", content: "Demo platform shipping configuration." },
    ],
  }),
  component: AdminShipping,
});

function AdminShipping() {
  return (
    <div className="space-y-4">
      <DemoBanner />
      <Card title="Fulfilment origins (all merchants)">
        <DataTable columns={["Store", "Origin", "Country", "Cut-off", "Handling"]}>
          {demoFulfillmentOrigins.map((o) => (
            <Row key={o.id}>
              <Cell className="text-xs">{storeById(o.storeId)?.name ?? o.storeId}</Cell>
              <Cell className="font-medium">{o.name}</Cell>
              <Cell>{o.country}</Cell>
              <Cell>
                {o.cutoffLocal} <span className="text-xs text-muted-foreground">{o.timezone}</span>
              </Cell>
              <Cell>{o.handlingDays}d</Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <Card title="Shipping profiles (all merchants)">
        <DataTable columns={["Store", "Profile", "Markets", "Base rate", "Free shipping"]}>
          {demoShippingProfiles.map((p) => (
            <Row key={p.id}>
              <Cell className="text-xs">{storeById(p.storeId)?.name ?? p.storeId}</Cell>
              <Cell className="font-medium">{p.name}</Cell>
              <Cell>{p.markets.join(", ")}</Cell>
              <Cell>{p.baseRateCents === 0 ? "manual quote" : formatEur(p.baseRateCents)}</Cell>
              <Cell>
                {p.freeShippingThresholdCents === null
                  ? "—"
                  : `from ${formatEur(p.freeShippingThresholdCents)}`}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <Card title="Rate cards and lane bindings">
        <DataTable columns={["Lane", "Carrier", "Band", "Price", "Transit profile", "Valid from", "Valid to"]}>
          {demoRateCards.map((r) => (
            <Row key={r.id}>
              <Cell className="font-medium">{r.lane}</Cell>
              <Cell>{r.carrier}</Cell>
              <Cell>{r.weightBand}</Cell>
              <Cell>{r.priceCents === 0 ? "manual quote" : formatEur(r.priceCents)}</Cell>
              <Cell className="text-xs">{r.transitProfile}</Cell>
              <Cell className="text-xs">{r.validFrom}</Cell>
              <Cell className="text-xs">{r.validTo ?? "open"}</Cell>
            </Row>
          ))}
        </DataTable>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Transit profiles">
          <ul className="space-y-2 text-sm">
            {demoTransitProfiles.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>
                  {t.name} <span className="text-xs text-muted-foreground">({t.calendar})</span>
                </span>
                <StatusBadge tone="info">
                  {t.minDays}–{t.maxDays}d
                </StatusBadge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Delivery promises">
          <ul className="space-y-2 text-sm">
            {demoDeliveryPromises.map((d) => (
              <li key={d.id}>
                {d.name}
                <div className="text-xs text-muted-foreground">
                  {d.weeklySchedule} · cut-off {d.cutoffLocal} {d.timezone}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
