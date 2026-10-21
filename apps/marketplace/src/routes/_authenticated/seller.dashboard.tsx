import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingBag, Plus, Store as StoreIcon } from "lucide-react";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/seller/dashboard")({
  head: () => ({
    meta: [
      { title: "Verkopers-dashboard — marktje" },
      { name: "description", content: "Beheer je marktje-shop." },
      { property: "og:title", content: "Verkopers-dashboard — marktje" },
      { property: "og:description", content: "Overzicht van je verkopen." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0 });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ count: pc }, { data: oi }] = await Promise.all([
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", u.user.id),
        supabase
          .from("order_items")
          .select("price_cents,quantity")
          .eq("seller_id", u.user.id),
      ]);
      const revenue = (oi ?? []).reduce((s, r) => s + r.price_cents * r.quantity, 0);
      setStats({ products: pc ?? 0, orders: oi?.length ?? 0, revenue });
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      <h1 className="text-2xl font-bold mb-4">Verkopers-dashboard</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Producten" value={stats.products.toString()} />
        <Stat label="Bestellingen" value={stats.orders.toString()} />
        <Stat label="Omzet" value={formatEur(stats.revenue)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Link
          to="/seller/products"
          className="bg-card border border-border rounded p-4 flex items-center gap-3 hover:shadow-md"
        >
          <Package className="w-6 h-6 text-brand" />
          <div>
            <div className="font-bold">Mijn producten</div>
            <div className="text-xs text-muted-foreground">Toevoegen, bewerken, verwijderen</div>
          </div>
        </Link>
        <Link
          to="/seller/orders"
          className="bg-card border border-border rounded p-4 flex items-center gap-3 hover:shadow-md"
        >
          <ShoppingBag className="w-6 h-6 text-brand" />
          <div>
            <div className="font-bold">Inkomende bestellingen</div>
            <div className="text-xs text-muted-foreground">Verwerk en verzend</div>
          </div>
        </Link>
        <Link
          to="/seller/manager"
          className="bg-card border border-border rounded p-4 flex items-center gap-3 hover:shadow-md md:col-span-2"
        >
          <StoreIcon className="w-6 h-6 text-brand" />
          <div>
            <div className="font-bold">Borvat Seller Manager (demo)</div>
            <div className="text-xs text-muted-foreground">
              Visual alpha with demo data: store, listings, inventory, shipping, quotes and messages
            </div>
          </div>
        </Link>
        <Link
          to="/seller/stores"
          className="bg-card border border-border rounded p-4 flex items-center gap-3 hover:shadow-md md:col-span-2"
        >
          <StoreIcon className="w-6 h-6 text-brand" />
          <div>
            <div className="font-bold">Merchant stores (Borvat Direct)</div>
            <div className="text-xs text-muted-foreground">
              Read-only overview of stores, channel accounts and draft listings
            </div>
          </div>
        </Link>

        <Link
          to="/seller/products/new"
          className="bg-brand text-brand-foreground rounded p-4 flex items-center gap-3 hover:opacity-95 md:col-span-2"
        >
          <Plus className="w-6 h-6" />
          <div className="font-bold">Nieuw product toevoegen</div>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
