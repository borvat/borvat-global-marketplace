import { Link } from "@tanstack/react-router";
import { Star, Heart } from "lucide-react";
import { formatEur, productImage } from "@/lib/format";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ProductCardData = {
  id: string;
  title: string;
  price_cents: number;
  original_price_cents: number | null;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
};

export function ProductCard({ p }: { p: ProductCardData }) {
  const hasDiscount = p.original_price_cents && p.original_price_cents > p.price_cents;
  const [inWishlist, setInWishlist] = useState(false);
  const [session, setSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
      if (data.session) {
        supabase.from("wishlist_items")
          .select("id", { head: true })
          .eq("user_id", data.session.user.id)
          .eq("product_id", p.id)
          .then(({ data: wl }) => setInWishlist(!!wl));
      }
    });
  }, [p.id]);

  async function toggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session) {
      toast.info("Log in om een verlanglijstje bij te houden");
      return;
    }
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return;
    if (inWishlist) {
      await supabase.from("wishlist_items").delete().eq("user_id", s.session.user.id).eq("product_id", p.id);
      setInWishlist(false);
      toast.success("Verwijderd uit verlanglijstje");
    } else {
      await supabase.from("wishlist_items").insert({ user_id: s.session.user.id, product_id: p.id });
      setInWishlist(true);
      toast.success("Toegevoegd aan verlanglijstje");
    }
  }

  return (
    <Link
      to="/product/$id"
      params={{ id: p.id }}
      className="bg-card rounded-xl border border-border hover:shadow-md transition p-3 flex flex-col group relative"
    >
      <button
        onClick={toggleWishlist}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/90 border border-border hover:bg-white shadow-sm"
        aria-label={inWishlist ? "Verwijder uit verlanglijstje" : "Voeg toe aan verlanglijstje"}
      >
        <Heart className={`w-4 h-4 ${inWishlist ? "fill-destructive text-destructive" : "text-muted-foreground"}`} />
      </button>
      <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-3">
        <img
          src={productImage(p.image_url, p.id)}
          alt={p.title}
          className="w-full h-full object-cover group-hover:scale-105 transition"
          loading="lazy"
        />
      </div>
      <h3 className="text-sm line-clamp-2 min-h-[2.5rem] mb-1 font-medium">{p.title}</h3>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
        <Star className="w-3 h-3 fill-accent-yellow text-accent-yellow" />
        <span>{p.rating?.toFixed(1) ?? "—"}</span>
        <span>({p.review_count ?? 0})</span>
      </div>
      <div className="mt-auto flex items-end gap-2">
        <div className="text-lg font-bold text-price">{formatEur(p.price_cents)}</div>
        {hasDiscount && (
          <div className="text-xs text-muted-foreground line-through mb-1">
            {formatEur(p.original_price_cents!)}
          </div>
        )}
      </div>
    </Link>
  );
}
