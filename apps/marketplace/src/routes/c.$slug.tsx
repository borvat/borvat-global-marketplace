import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/product-card";
import { ArrowDownUp, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/c/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Borvat` },
      { name: "description", content: `Bekijk alle producten in ${params.slug} op Borvat.` },
      { property: "og:title", content: `${params.slug} — Borvat` },
      { property: "og:description", content: `Ontdek producten in ${params.slug}.` },
    ],
  }),
  component: CategoryPage,
});

const sorts = [
  { label: "Aanbevolen", value: "featured" },
  { label: "Prijs: laag-hoog", value: "price_asc" },
  { label: "Prijs: hoog-laag", value: "price_desc" },
  { label: "Beste beoordeling", value: "rating" },
  { label: "Meest bekeken", value: "reviews" },
];

function CategoryPage() {
  const { slug } = Route.useParams();
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [cat, setCat] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("featured");
  const [priceMax, setPriceMax] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: catData } = await supabase
        .from("categories")
        .select("id,name")
        .eq("slug", slug)
        .maybeSingle();
      if (catData) {
        setCat(catData);
        let query = supabase
          .from("products")
          .select("id,title,price_cents,original_price_cents,image_url,rating,review_count")
          .eq("category_id", catData.id)
          .eq("is_active", true);
        if (priceMax) query = query.lte("price_cents", priceMax * 100);
        if (sort === "price_asc") query = query.order("price_cents", { ascending: true });
        else if (sort === "price_desc") query = query.order("price_cents", { ascending: false });
        else if (sort === "rating") query = query.order("rating", { ascending: false });
        else if (sort === "reviews") query = query.order("review_count", { ascending: false });
        else query = query.order("rating", { ascending: false });
        const { data } = await query.limit(48);
        setProducts(data ?? []);
      }
      setLoading(false);
    })();
  }, [slug, sort, priceMax]);

  return (
    <div className="max-w-7xl mx-auto px-3 py-4">
      <div className="relative rounded-2xl overflow-hidden mb-6 h-40 md:h-52 flex items-end">
        <img
          src={`/images/categories/${slug}.jpg`}
          alt={cat?.name ?? slug}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="relative z-10 p-6 text-white">
          <h1 className="text-3xl md:text-4xl font-bold">{cat?.name ?? slug}</h1>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Max prijs:</span>
          <select
            value={priceMax ?? ""}
            onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : null)}
            className="border border-border rounded px-2 py-1 text-sm bg-background"
          >
            <option value="">Alle prijzen</option>
            <option value="25">€25</option>
            <option value="50">€50</option>
            <option value="100">€100</option>
            <option value="250">€250</option>
            <option value="500">€500</option>
          </select>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm bg-background"
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">{products.length} producten</span>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : products.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          Geen producten gevonden in deze categorie met de huidige filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
