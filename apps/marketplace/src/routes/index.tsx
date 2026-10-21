import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/product-card";
import { Truck, ShieldCheck, RotateCcw, Sparkles, ArrowRight } from "lucide-react";
import heroImage from "../../public/images/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Borvat — Smart living, made affordable" },
      {
        name: "description",
        content:
          "Ontdek slimme producten voor wonen, elektronica, mode en meer. Snelle bezorging, veilig betalen.",
      },
      { property: "og:title", content: "Borvat — Smart living, made affordable" },
      { property: "og:description", content: "Ontdek slimme producten voor wonen, elektronica, mode en meer. Snelle bezorging, veilig betalen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [deals, setDeals] = useState<ProductCardData[]>([]);
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,title,price_cents,original_price_cents,image_url,rating,review_count")
      .eq("is_active", true)
      .order("rating", { ascending: false })
      .limit(12)
      .then(({ data }) => setProducts(data ?? []));
    supabase
      .from("products")
      .select("id,title,price_cents,original_price_cents,image_url,rating,review_count")
      .eq("is_active", true)
      .gt("original_price_cents", 0)
      .order("review_count", { ascending: false })
      .limit(6)
      .then(({ data }) => setDeals(data ?? []));
    supabase
      .from("categories")
      .select("slug,name")
      .order("sort_order")
      .then(({ data }) => setCats(data ?? []));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 py-4 space-y-8">
      {/* Hero */}
      <section className="relative rounded-2xl overflow-hidden min-h-[320px] md:min-h-[400px] flex items-center">
        <img
          src={heroImage}
          alt="Borvat smart living"
          className="absolute inset-0 w-full h-full object-cover"
          width={1200}
          height={600}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand/90 via-brand/70 to-transparent" />
        <div className="relative z-10 max-w-xl p-6 md:p-10 text-brand-foreground">
          <div className="inline-flex items-center gap-2 bg-accent-yellow text-accent-foreground text-xs font-bold px-3 py-1.5 rounded-full mb-4">
            <Sparkles className="w-3.5 h-3.5" /> NIEUW
          </div>
          <h1 className="text-3xl md:text-5xl font-black mb-3 leading-tight">
            Smart living, made affordable.
          </h1>
          <p className="opacity-95 mb-6 text-sm md:text-base">
            Ontdek slimme producten die je huis, je gezondheid en je dagelijks leven een stukje makkelijker maken.
          </p>
          <Link
            to="/c/$slug"
            params={{ slug: "elektronica" }}
            className="inline-flex items-center gap-2 bg-accent-yellow text-accent-foreground font-bold px-5 py-2.5 rounded-full hover:opacity-90 transition"
          >
            Ontdek de deals <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Trust bar */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { icon: Truck, label: "Gratis verzending vanaf €20" },
          { icon: ShieldCheck, label: "Veilig achteraf betalen" },
          { icon: RotateCcw, label: "30 dagen retour" },
        ].map((f, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
          >
            <div className="bg-brand/10 p-2 rounded-full">
              <f.icon className="w-5 h-5 text-brand" />
            </div>
            <span className="text-sm font-medium">{f.label}</span>
          </div>
        ))}
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-bold">Populaire categorieën</h2>
          <Link to="/search" className="text-sm text-brand hover:underline flex items-center gap-1">
            Alles bekijken <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {cats.map((c) => (
            <Link
              key={c.slug}
              to="/c/$slug"
              params={{ slug: c.slug }}
              className="group bg-card border border-border rounded-xl p-3 text-center text-sm hover:shadow-md transition overflow-hidden"
            >
              <div className="aspect-square mx-auto mb-2 rounded-lg overflow-hidden bg-muted">
                <img
                  src={`/images/categories/${c.slug}.jpg`}
                  alt={c.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  loading="lazy"
                />
              </div>
              <span className="font-medium">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Deals */}
      {deals.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-bold">Deals van de week</h2>
            <span className="text-sm text-muted-foreground">{deals.length} aanbiedingen</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {deals.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-bold">Uitgelicht</h2>
          <span className="text-sm text-muted-foreground">{products.length} producten</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
