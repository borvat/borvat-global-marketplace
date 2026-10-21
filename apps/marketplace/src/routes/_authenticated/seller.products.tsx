import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatEur, productImage } from "@/lib/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/seller/products")({
  head: () => ({
    meta: [
      { title: "Mijn producten — marktje" },
      { name: "description", content: "Beheer je producten." },
      { property: "og:title", content: "Mijn producten — marktje" },
      { property: "og:description", content: "Voeg producten toe en bewerk ze." },
    ],
  }),
  component: MyProducts,
});

type P = {
  id: string;
  title: string;
  price_cents: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
};

function MyProducts() {
  const [items, setItems] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("products")
      .select("id,title,price_cents,stock,image_url,is_active")
      .eq("seller_id", u.user.id)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm("Product verwijderen?")) return;
    await supabase.from("products").delete().eq("id", id);
    toast.success("Verwijderd");
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Mijn producten</h1>
        <Link
          to="/seller/products/new"
          className="bg-brand text-brand-foreground rounded px-3 py-2 text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Nieuw
        </Link>
      </div>
      {loading ? (
        <p>Laden…</p>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded p-8 text-center text-muted-foreground">
          Nog geen producten. Voeg je eerste product toe.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-border rounded p-3 flex gap-3 items-center"
            >
              <img
                src={productImage(p.image_url, p.id)}
                alt=""
                className="w-16 h-16 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium line-clamp-1">{p.title}</div>
                <div className="text-sm text-muted-foreground">
                  {formatEur(p.price_cents)} · voorraad {p.stock}{" "}
                  {!p.is_active && <span className="text-destructive">(inactief)</span>}
                </div>
              </div>
              <Link
                to="/seller/products/$id/edit"
                params={{ id: p.id }}
                className="p-2 hover:bg-muted rounded"
                aria-label="Bewerk"
              >
                <Pencil className="w-4 h-4" />
              </Link>
              <button
                onClick={() => del(p.id)}
                className="p-2 hover:bg-muted rounded text-destructive"
                aria-label="Verwijder"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
