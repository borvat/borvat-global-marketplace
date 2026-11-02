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
      className="brv-media group flex flex-col focus-visible:outline-none"
      aria-label={p.title}
    >
      <div className="relative overflow-hidden bg-surface">
        <div className="aspect-[4/5] w-full">
          <img
            src={productImage(p.image_url, p.id)}
            alt={p.title}
            className="h-full w-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(.2,.6,.2,1)] group-hover:scale-[1.03]"
            loading="lazy"
          />
        </div>
        <button
          onClick={toggleWishlist}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 backdrop-blur-sm transition-colors hover:bg-background"
          aria-label={inWishlist ? "Verwijder uit verlanglijstje" : "Voeg toe aan verlanglijstje"}
        >
          <Heart className={`h-4 w-4 ${inWishlist ? "fill-accent text-accent" : "text-foreground/60"}`} />
        </button>
        {hasDiscount && (
          <span className="absolute bottom-3 left-3 bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-accent">
            Aanbieding
          </span>
        )}
      </div>

      <div className="pt-3">
        <h3 className="brv-display line-clamp-2 text-[15px] leading-snug text-foreground underline-offset-4 group-hover:underline">
          {p.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Star className="h-3 w-3 fill-current text-accent" aria-hidden="true" />
          <span className="brv-price">{p.rating?.toFixed(1) ?? "—"}</span>
          <span className="brv-price">({p.review_count ?? 0})</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="brv-price text-[15px] font-medium text-foreground">
            {formatEur(p.price_cents)}
          </span>
          {hasDiscount && (
            <span className="brv-price text-[12px] text-muted-foreground line-through">
              {formatEur(p.original_price_cents!)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
