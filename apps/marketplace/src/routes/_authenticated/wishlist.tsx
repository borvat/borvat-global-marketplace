import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/product-card";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wishlist")({
  head: () => ({
    meta: [
      { title: "Mijn verlanglijstje — Borvat" },
      { name: "description", content: "Bekijk je opgeslagen producten op Borvat." },
      { property: "og:title", content: "Mijn verlanglijstje — Borvat" },
      { property: "og:description", content: "Je opgeslagen producten." },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const [items, setItems] = useState<ProductCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("wishlist_items")
        .select("products(id,title,price_cents,original_price_cents,image_url,rating,review_count)")
        .eq("user_id", sess.session.user.id)
        .order("created_at", { ascending: false });
      const mapped = (data ?? [])
        .map((d: any) => d.products as ProductCardData | null)
        .filter(Boolean) as ProductCardData[];
      setItems(mapped);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 py-4">
      <h1 className="text-2xl font-bold mb-1">Mijn verlanglijstje</h1>
      <p className="text-sm text-muted-foreground mb-4">{items.length} producten opgeslagen</p>

      {loading ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Je verlanglijstje is nog leeg.</p>
          <Link to="/" className="text-brand hover:underline font-medium">
            Ontdek producten
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {items.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
