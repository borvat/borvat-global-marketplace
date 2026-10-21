import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatEur, productImage } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Winkelmandje — Borvat" },
      { name: "description", content: "Bekijk je winkelmandje op Borvat." },
      { property: "og:title", content: "Winkelmandje — Borvat" },
      { property: "og:description", content: "Klaar om af te rekenen?" },
    ],
  }),
  component: CartPage,
});

type Row = {
  id: string;
  quantity: number;
  products: {
    id: string;
    title: string;
    price_cents: number;
    image_url: string | null;
    stock: number;
  } | null;
};

function CartPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    setSignedIn(!!sess.session);
    if (!sess.session) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("cart_items")
      .select("id,quantity,products(id,title,price_cents,image_url,stock)")
      .order("created_at");
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    await supabase.from("cart_items").delete().eq("id", id);
    load();
  }
  async function setQty(id: string, quantity: number) {
    if (quantity < 1) return;
    await supabase.from("cart_items").update({ quantity }).eq("id", id);
    load();
  }

  const total = rows.reduce((s, r) => s + (r.products?.price_cents ?? 0) * r.quantity, 0);
  const shipping = total >= 2000 ? 0 : 495;
  const itemCount = rows.reduce((s, r) => s + r.quantity, 0);

  if (loading) return <div className="max-w-4xl mx-auto p-4">Laden…</div>;

  if (!signedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <h1 className="text-2xl font-bold mb-4">Winkelmandje</h1>
        <p className="text-muted-foreground mb-4">Log in om je winkelmandje te bekijken.</p>
        <Link
          to="/auth"
          className="inline-block bg-brand text-brand-foreground px-4 py-2 rounded-lg font-medium"
        >
          Inloggen
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      <h1 className="text-2xl font-bold mb-1">Winkelmandje</h1>
      <p className="text-sm text-muted-foreground mb-4">{itemCount} artikel{itemCount !== 1 ? "en" : ""}</p>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Je winkelmandje is leeg.</p>
          <Link to="/" className="text-brand hover:underline font-medium">
            Verder winkelen
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            {rows.map((r) =>
              r.products ? (
                <div
                  key={r.id}
                  className="bg-card border border-border rounded-xl p-3 flex gap-3"
                >
                  <img
                    src={productImage(r.products.image_url, r.products.id)}
                    alt={r.products.title}
                    className="w-24 h-24 object-cover rounded-lg bg-muted"
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/product/$id"
                      params={{ id: r.products.id }}
                      className="font-medium hover:underline line-clamp-2"
                    >
                      {r.products.title}
                    </Link>
                    <div className="text-price font-bold mt-1">
                      {formatEur(r.products.price_cents)}
                    </div>
                    {r.products.stock < r.quantity && (
                      <div className="text-xs text-destructive mt-1">
                        Slechts {r.products.stock} op voorraad
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => setQty(r.id, r.quantity - 1)}
                        className="border border-border w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm w-6 text-center font-medium">{r.quantity}</span>
                      <button
                        onClick={() => setQty(r.id, r.quantity + 1)}
                        className="border border-border w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        aria-label="Verwijder"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null,
            )}
          </div>
          <aside className="bg-card border border-border rounded-xl p-4 h-fit sticky top-28">
            <h2 className="font-bold mb-3">Overzicht</h2>
            <div className="flex justify-between text-sm mb-2">
              <span>Subtotaal</span>
              <span>{formatEur(total)}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span>Verzending</span>
              <span>{shipping === 0 ? "Gratis" : formatEur(shipping)}</span>
            </div>
            <div className="border-t border-border my-3" />
            <div className="flex justify-between font-bold mb-3">
              <span>Totaal</span>
              <span>{formatEur(total + shipping)}</span>
            </div>
            <button
              onClick={() => {
                if (rows.some((r) => !r.products || r.products.stock < r.quantity)) {
                  toast.error("Sommige producten zijn niet meer voldoende voorradig");
                  return;
                }
                navigate({ to: "/checkout" });
              }}
              className="w-full bg-accent-yellow text-accent-foreground font-bold py-2.5 rounded-lg hover:opacity-90 flex items-center justify-center gap-2"
            >
              Afrekenen <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-xs text-muted-foreground text-center mt-2">
              Gratis verzending vanaf €20
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
