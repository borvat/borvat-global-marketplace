import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star, Truck, ShieldCheck, RotateCcw, Heart, Share2, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatEur, productImage } from "@/lib/format";
import { toast } from "sonner";
import { ProductCard, type ProductCardData } from "@/components/product-card";

type Product = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  original_price_cents: number | null;
  stock: number;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
  seller_id: string;
  category_id: string | null;
  brand: string | null;
  highlights: string[] | null;
  specs: Record<string, string> | null;
  profiles?: { seller_shop_name: string | null; full_name: string | null } | null;
  categories?: { slug: string; name: string } | null;
};

export const Route = createFileRoute("/product/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Product — Borvat` },
      { name: "description", content: `Bekijk dit product op Borvat.` },
      { property: "og:title", content: `Product op Borvat` },
      { property: "og:description", content: `Product ${params.id}` },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const [p, setP] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [related, setRelated] = useState<ProductCardData[]>([]);
  const [inWishlist, setInWishlist] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: prod } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (prod) {
        const [profRes, catRes] = await Promise.all([
          prod.seller_id
            ? supabase
                .from("profiles")
                .select("seller_shop_name, full_name")
                .eq("id", prod.seller_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          prod.category_id
            ? supabase
                .from("categories")
                .select("slug,name")
                .eq("id", prod.category_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        setP({ ...(prod as any), profiles: profRes.data, categories: catRes.data } as Product);
        if (prod.category_id) {
          supabase
            .from("products")
            .select("id,title,price_cents,original_price_cents,image_url,rating,review_count")
            .eq("category_id", prod.category_id)
            .neq("id", id)
            .eq("is_active", true)
            .limit(6)
            .then(({ data: rel }) => setRelated(rel ?? []));
        }
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) {
          const { data: wl } = await supabase
            .from("wishlist_items")
            .select("id")
            .eq("user_id", sess.session.user.id)
            .eq("product_id", id)
            .maybeSingle();
          setInWishlist(!!wl);
        }
      } else {
        setP(null);
      }
      setLoading(false);
    })();
  }, [id]);

  async function toggleWishlist() {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      navigate({ to: "/auth" });
      return;
    }
    if (inWishlist) {
      await supabase.from("wishlist_items").delete().eq("user_id", sess.session.user.id).eq("product_id", id);
      setInWishlist(false);
      toast.success("Verwijderd uit verlanglijstje");
    } else {
      await supabase.from("wishlist_items").insert({ user_id: sess.session.user.id, product_id: id });
      setInWishlist(true);
      toast.success("Toegevoegd aan verlanglijstje");
    }
  }

  async function addToCart() {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.info("Log eerst in om te kopen");
      navigate({ to: "/auth" });
      return;
    }
    if (!p) return;
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id,quantity")
      .eq("user_id", sess.session.user.id)
      .eq("product_id", p.id)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + qty })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("cart_items")
        .insert({ user_id: sess.session.user.id, product_id: p.id, quantity: qty });
    }
    toast.success("Toegevoegd aan winkelmandje");
  }

  if (loading) return <div className="max-w-7xl mx-auto px-3 py-4">Laden…</div>;
  if (!p) return <div className="max-w-7xl mx-auto px-3 py-4">Product niet gevonden.</div>;

  const shopName = p.profiles?.seller_shop_name || p.profiles?.full_name || "Borvat";
  const discount = p.original_price_cents && p.original_price_cents > p.price_cents
    ? Math.round(((p.original_price_cents - p.price_cents) / p.original_price_cents) * 100)
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-3 py-4 space-y-8">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-center">
          <img
            src={productImage(p.image_url, p.id)}
            alt={p.title}
            className="w-full max-w-md aspect-square object-contain"
          />
        </div>
        <div>
          {p.categories && (
            <Link
              to="/c/$slug"
              params={{ slug: p.categories.slug }}
              className="text-sm text-brand hover:underline"
            >
              {p.categories.name}
            </Link>
          )}
          {p.brand && <div className="text-xs uppercase tracking-wide text-muted-foreground mt-2">{p.brand}</div>}
          <h1 className="text-2xl md:text-3xl font-bold mt-1 mb-2">{p.title}</h1>
          <Link
            to="/seller/$id"
            params={{ id: p.seller_id }}
            className="text-sm text-muted-foreground hover:text-brand"
          >
            Verkocht door {shopName}
          </Link>
          <div className="flex items-center gap-1 text-sm my-3">
            <Star className="w-4 h-4 fill-accent-yellow text-accent-yellow" />
            <span className="font-medium">{p.rating?.toFixed(1) ?? "—"}</span>
            <span className="text-muted-foreground">({p.review_count ?? 0} reviews)</span>
          </div>

          <div className="my-4 flex items-end gap-3">
            <div className="text-3xl md:text-4xl font-bold text-price">{formatEur(p.price_cents)}</div>
            {p.original_price_cents && p.original_price_cents > p.price_cents && (
              <>
                <div className="text-lg text-muted-foreground line-through mb-1">
                  {formatEur(p.original_price_cents)}
                </div>
                {discount > 0 && (
                  <div className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded mb-1">
                    -{discount}%
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2 text-sm mb-5">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand" /> Voor 23:59 besteld, morgen in huis
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" /> Veilig betalen
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-brand" /> 30 dagen retour
            </div>
            <div className={p.stock > 0 ? "text-success" : "text-destructive"}>
              {p.stock > 0 ? `✓ Op voorraad (${p.stock} beschikbaar)` : "Uitverkocht"}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <label className="text-sm font-medium">Aantal:</label>
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="px-3 py-2 hover:bg-muted"
                aria-label="Verminder"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-sm font-medium">{qty}</span>
              <button
                onClick={() => setQty(Math.min(p.stock, qty + 1))}
                className="px-3 py-2 hover:bg-muted"
                aria-label="Vermeerder"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={addToCart}
              disabled={p.stock === 0}
              className="flex-1 bg-accent-yellow text-accent-foreground font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              In winkelwagen
            </button>
            <button
              onClick={toggleWishlist}
              className="px-4 py-3 border border-border rounded-xl hover:bg-muted"
              aria-label={inWishlist ? "Verwijder uit verlanglijstje" : "Voeg toe aan verlanglijstje"}
            >
              <Heart className={`w-5 h-5 ${inWishlist ? "fill-destructive text-destructive" : ""}`} />
            </button>
            <button
              onClick={() => navigator.share?.({ title: p.title, url: window.location.href })}
              className="px-4 py-3 border border-border rounded-xl hover:bg-muted"
              aria-label="Delen"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>

          {p.highlights && p.highlights.length > 0 && (
            <div className="mt-6 bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold mb-3">Productkenmerken</h2>
              <ul className="space-y-1.5 text-sm">
                {p.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2"><span className="text-brand">•</span><span>{h}</span></li>
                ))}
              </ul>
            </div>
          )}
          {p.description && (
            <div className="mt-4 bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold mb-2">Productomschrijving</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>
            </div>
          )}
          {p.specs && Object.keys(p.specs).length > 0 && (
            <div className="mt-4 bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold mb-3">Specificaties</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {Object.entries(p.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium text-right">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">Vergelijkbare producten</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
