import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DemoBanner,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  toneForStatus,
  SearchInput,
  Card,
} from "@/components/demo/shell";
import { demoCompanies, demoStores } from "@/demo/companies";

export const Route = createFileRoute("/_authenticated/admin/companies")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Companies (demo) — Borvat Admin" },
      { name: "description", content: "Demo view of merchant legal entities and their stores." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Companies (demo) — Borvat Admin" },
      { property: "og:description", content: "Demo merchant companies overview." },
    ],
  }),
  component: AdminCompanies,
});

function AdminCompanies() {
  const [q, setQ] = useState("");
  const rows = demoCompanies.filter((c) =>
    q.trim() === "" ? true : (c.name + c.vatNumber).toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <DemoBanner note="Demo companies. Onboarding a seventh external merchant requires no code or schema change." />
      <div className="flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search company or VAT…" />
      </div>

      <DataTable columns={["Company", "Country", "VAT", "Chamber", "Verification", "Stores", "Onboarded"]}>
        {rows.map((c) => (
          <Row key={c.id}>
            <Cell className="font-medium">{c.name}</Cell>
            <Cell>{c.country}</Cell>
            <Cell className="font-mono text-xs">{c.vatNumber}</Cell>
            <Cell className="font-mono text-xs">{c.kvk}</Cell>
            <Cell>
              <StatusBadge tone={toneForStatus(c.verification)}>{c.verification}</StatusBadge>
            </Cell>
            <Cell>{c.storeIds.length}</Cell>
            <Cell className="text-xs">{c.onboardedAt}</Cell>
          </Row>
        ))}
      </DataTable>

      <Card title="Stores per company">
        <ul className="space-y-2 text-sm">
          {rows.map((c) => (
            <li key={c.id}>
              <div className="font-medium">{c.name}</div>
              <ul className="ml-4 list-disc text-muted-foreground">
                {c.storeIds.map((sid) => {
                  const s = demoStores.find((x) => x.id === sid);
                  return s ? (
                    <li key={sid}>
                      {s.name} — {s.markets.join("/")} — {s.status}
                    </li>
                  ) : null;
                })}
              </ul>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
