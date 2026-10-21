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
import {
  demoDeliveryPromises,
  demoFulfillmentOrigins,
  demoRateCards,
  demoShippingProfiles,
  demoTransitProfiles,
} from "@/demo/shipping";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/shipping")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Shipping — Borvat Seller Manager" },
      { name: "description", content: "Manage origins, profiles, packages, rate cards, delivery promises and calendars." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Shipping — Borvat Seller Manager" },
      { property: "og:description", content: "Shipping configuration workspace for Borvat sellers." },
    ],
  }),
  component: SellerShipping,
});

const TABS = [
  { id: "origins", label: "Origins" },
  { id: "profiles", label: "Shipping profiles" },
  { id: "packages", label: "Packages" },
  { id: "rates", label: "Rate cards" },
  { id: "promises", label: "Delivery promises" },
  { id: "transit", label: "Transit profiles" },
  { id: "calendars", label: "Calendars" },
  { id: "rules", label: "Manual quote rules" },
];

const demoPackages = [
  { id: "pkg_1", name: "Parcel S", dims: "35×25×10 cm", maxKg: 5, carriers: "PostNL, DPD" },
  { id: "pkg_2", name: "Parcel M", dims: "50×35×25 cm", maxKg: 15, carriers: "PostNL, DPD" },
  { id: "pkg_3", name: "Parcel L", dims: "80×50×40 cm", maxKg: 30, carriers: "DPD" },
  { id: "pkg_4", name: "Pallet half", dims: "80×60×120 cm", maxKg: 300, carriers: "Palletways" },
  { id: "pkg_5", name: "Pallet EUR", dims: "120×80×160 cm", maxKg: 700, carriers: "Palletways" },
];

const demoCalendars = [
  { id: "cal_1", name: "NL Business", week: "Ma–Vr", blackouts: "25–26 Dec 2026", timezone: "Europe/Amsterdam" },
  { id: "cal_2", name: "BE Business", week: "Ma–Vr", blackouts: "21 Jul 2026", timezone: "Europe/Brussels" },
  { id: "cal_3", name: "Bulky Ma–Do", week: "Ma–Do", blackouts: "—", timezone: "Europe/Amsterdam" },
];

const demoQuoteRules = [
  { id: "qr_1", trigger: "Weight > 30 kg", action: "Force manual quote", scope: "NL, BE", status: "active" },
  { id: "qr_2", trigger: "Longest side > 150 cm", action: "Force manual quote", scope: "NL", status: "active" },
  { id: "qr_3", trigger: "Postcode area 1000–1099 (BE)", action: "Manual quote + access check", scope: "BE", status: "draft" },
];

function SellerShipping() {
  const store = storeById(demoActiveStoreId)!;
  const [tab, setTab] = useState("origins");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<{ title: string; items: [string, React.ReactNode][] } | null>(null);

  const origins = demoFulfillmentOrigins.filter((o) => o.storeId === store.id);
  const profiles = demoShippingProfiles.filter((p) => p.storeId === store.id);
  const like = (s: string) => (q ? s.toLowerCase().includes(q.toLowerCase()) : true);

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={store.name}
      nav={SELLER_NAV}
      title="Shipping"
      subtitle="Origins, rates and delivery promises that feed the final ETA resolver"
      actions={<DemoAction label="New configuration" size="sm" variant="primary" />}
      tabs={<Tabs tabs={TABS} active={tab} onChange={setTab} />}
    >
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Filter this tab…" />
        <span className="ml-auto text-[12px] text-muted-foreground">
          Values are governed by the shipping foundation schema (read-only preview)
        </span>
      </Toolbar>

      {tab === "origins" ? (
        <DataTable columns={["Origin", "Address", "Country", "Cut-off", "Timezone", "Handling days", ""]}>
          {origins.filter((o) => like(o.name + o.address)).map((o) => (
            <Row
              key={o.id}
              onClick={() =>
                setDetail({
                  title: o.name,
                  items: [
                    ["Address", o.address],
                    ["Country", o.country],
                    ["Cut-off", o.cutoffLocal],
                    ["Timezone", o.timezone],
                    ["Handling days", String(o.handlingDays)],
                  ],
                })
              }
            >
              <Cell className="font-medium">{o.name}</Cell>
              <Cell className="max-w-[300px] truncate">{o.address}</Cell>
              <Cell>{o.country}</Cell>
              <Cell className="tabular-nums">{o.cutoffLocal}</Cell>
              <Cell className="text-[12px]">{o.timezone}</Cell>
              <Cell className="tabular-nums">{o.handlingDays}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "profiles" ? (
        <DataTable columns={["Profile", "Markets", "Base rate", "Free shipping from", "Packages", ""]}>
          {profiles.filter((p) => like(p.name)).map((p) => (
            <Row key={p.id}>
              <Cell className="font-medium">{p.name}</Cell>
              <Cell>{p.markets.join(", ")}</Cell>
              <Cell className="tabular-nums">{formatEur(p.baseRateCents)}</Cell>
              <Cell className="tabular-nums">
                {p.freeShippingThresholdCents ? formatEur(p.freeShippingThresholdCents) : "—"}
              </Cell>
              <Cell className="text-[12px]">{p.packages.join(", ")}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "packages" ? (
        <DataTable columns={["Package", "Dimensions", "Max weight", "Carriers", ""]} minWidth={700}>
          {demoPackages.filter((p) => like(p.name)).map((p) => (
            <Row key={p.id}>
              <Cell className="font-medium">{p.name}</Cell>
              <Cell>{p.dims}</Cell>
              <Cell className="tabular-nums">{p.maxKg} kg</Cell>
              <Cell className="text-[12px]">{p.carriers}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "rates" ? (
        <DataTable columns={["Lane", "Carrier", "Weight band", "Price", "Transit profile", "Valid from", "Valid to", ""]}>
          {demoRateCards.filter((r) => like(r.lane + r.carrier)).map((r) => (
            <Row key={r.id}>
              <Cell className="font-medium">{r.lane}</Cell>
              <Cell>{r.carrier}</Cell>
              <Cell>{r.weightBand}</Cell>
              <Cell className="tabular-nums">{r.priceCents ? formatEur(r.priceCents) : "manual"}</Cell>
              <Cell className="text-[12px]">{r.transitProfile}</Cell>
              <Cell className="text-[12px]">{r.validFrom}</Cell>
              <Cell className="text-[12px]">{r.validTo ?? "open"}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "promises" ? (
        <DataTable columns={["Promise", "Cut-off", "Timezone", "Week", "Transit profile", "Calendar", ""]}>
          {demoDeliveryPromises.filter((p) => like(p.name)).map((p) => (
            <Row key={p.id}>
              <Cell className="font-medium">{p.name}</Cell>
              <Cell className="tabular-nums">{p.cutoffLocal}</Cell>
              <Cell className="text-[12px]">{p.timezone}</Cell>
              <Cell>{p.weeklySchedule}</Cell>
              <Cell className="text-[12px]">{p.transitProfile}</Cell>
              <Cell className="text-[12px]">{p.calendarProfile}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "transit" ? (
        <DataTable columns={["Profile", "Min days", "Max days", "Calendar", "Blackout dates", ""]} minWidth={760}>
          {demoTransitProfiles.filter((t) => like(t.name)).map((t) => (
            <Row key={t.id}>
              <Cell className="font-medium">{t.name}</Cell>
              <Cell className="tabular-nums">{t.minDays}</Cell>
              <Cell className="tabular-nums">{t.maxDays}</Cell>
              <Cell>{t.calendar}</Cell>
              <Cell className="text-[12px]">{t.blackoutDates.join(", ") || "—"}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "calendars" ? (
        <DataTable columns={["Calendar", "Working week", "Blackouts", "Timezone", ""]} minWidth={700}>
          {demoCalendars.filter((c) => like(c.name)).map((c) => (
            <Row key={c.id}>
              <Cell className="font-medium">{c.name}</Cell>
              <Cell>{c.week}</Cell>
              <Cell className="text-[12px]">{c.blackouts}</Cell>
              <Cell className="text-[12px]">{c.timezone}</Cell>
              <Cell><DemoAction label="Edit" size="sm" /></Cell>
            </Row>
          ))}
        </DataTable>
      ) : null}

      {tab === "rules" ? (
        <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <DataTable columns={["Trigger", "Action", "Scope", "Status", ""]} minWidth={640}>
            {demoQuoteRules.filter((r) => like(r.trigger)).map((r) => (
              <Row key={r.id}>
                <Cell className="font-medium">{r.trigger}</Cell>
                <Cell>{r.action}</Cell>
                <Cell>{r.scope}</Cell>
                <Cell>
                  <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
                </Cell>
                <Cell><DemoAction label="Edit" size="sm" /></Cell>
              </Row>
            ))}
          </DataTable>
          <Card title="How rules are applied">
            <p className="text-[13px] text-muted-foreground">
              When a rule matches, automatic rate cards are skipped and the item enters the manual
              shipping quote workflow. The customer only sees a price after Borvat releases an
              offer.
            </p>
          </Card>
        </div>
      ) : null}

      <Drawer open={detail !== null} onClose={() => setDetail(null)} title={detail?.title ?? ""}>
        {detail ? <KeyValue items={detail.items} /> : null}
      </Drawer>
    </ManagerShell>
  );
}
