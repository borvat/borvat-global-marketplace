import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ManagerShell,
  SELLER_NAV,
  DataTable,
  Row,
  Cell,
  StatusBadge,
  DemoAction,
  SearchInput,
  Toolbar,
  EmptyState,
  Card,
} from "@/components/demo/shell";
import { useActiveSellerWorkspace, useSellerInventory } from "@/hooks/useSellerData";

export const Route = createFileRoute("/_authenticated/seller/inventory")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inventory — Borvat Seller Manager" },
      {
        name: "description",
        content: "Live read-only stock: on hand, reserved and available units per SKU and warehouse.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Inventory — Borvat Seller Manager" },
      { property: "og:description", content: "Live stock levels per SKU and warehouse." },
    ],
  }),
  component: SellerInventory,
});

function SellerInventory() {
  const { active, isLoading: wsLoading, error: wsError } = useActiveSellerWorkspace();
  const inventory = useSellerInventory(active?.company_id, active?.store_id, 500, 0);

  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  const all = inventory.data ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => (onlyLow ? (r.available ?? 0) <= 5 : true))
      .filter((r) =>
        needle === ""
          ? true
          : `${r.title ?? ""} ${r.sku_code ?? ""} ${r.warehouse_code ?? ""}`
              .toLowerCase()
              .includes(needle),
      );
  }, [all, q, onlyLow]);

  const shopName = active?.store_name ?? active?.company_name ?? "Seller Manager";
  const loading = wsLoading || inventory.isLoading;
  const error = wsError ?? (inventory.error as Error | null);

  return (
    <ManagerShell
      workspace="seller"
      navTitle="Seller Manager"
      shopName={shopName}
      nav={SELLER_NAV}
      classification="REAL READ-ONLY"
      title="Inventory"
      subtitle="Live balances from the append-only stock ledger · read-only"
      actions={<DemoAction label="Export CSV" size="sm" />}
    >
      {error ? (
        <Card title="Data unavailable">
          <p className="text-[13px] text-muted-foreground">{error.message}</p>
        </Card>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Search product, SKU or warehouse…" />
            <label className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-1.5 text-[13px]">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
              />
              Only low stock
            </label>
            <span className="text-[12px] text-muted-foreground">
              {loading ? "Loading…" : `${rows.length} of ${all.length} stock rows`}
            </span>
          </Toolbar>

          {!loading && rows.length === 0 ? (
            <EmptyState
              title="No stock rows"
              hint="No inventory balances are recorded for this shop yet."
            />
          ) : (
            <DataTable
              columns={[
                "SKU",
                "Product",
                "Warehouse",
                "Location",
                "On hand",
                "Reserved",
                "Available",
                "Published",
                "Last movement",
              ]}
              minWidth={1040}
            >
              {rows.map((r) => (
                <Row key={`${r.sku_id}-${r.warehouse_code ?? ""}-${r.location_code ?? ""}`}>
                  <Cell className="font-mono text-[12px]">{r.sku_code ?? "—"}</Cell>
                  <Cell className="max-w-[260px] truncate">{r.title ?? "—"}</Cell>
                  <Cell className="text-[12px]">{r.warehouse_name ?? r.warehouse_code ?? "—"}</Cell>
                  <Cell className="font-mono text-[12px]">{r.location_code ?? "—"}</Cell>
                  <Cell className="tabular-nums">{r.on_hand ?? 0}</Cell>
                  <Cell className="tabular-nums">{r.reserved ?? 0}</Cell>
                  <Cell className="tabular-nums">
                    {(r.available ?? 0) <= 5 ? (
                      <StatusBadge tone="warn">{r.available ?? 0}</StatusBadge>
                    ) : (
                      r.available ?? 0
                    )}
                  </Cell>
                  <Cell className="tabular-nums">{r.published_quantity ?? 0}</Cell>
                  <Cell className="text-[12px] text-muted-foreground">
                    {r.last_movement_at ? new Date(r.last_movement_at).toLocaleString("en-GB") : "—"}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </>
      )}
    </ManagerShell>
  );
}
