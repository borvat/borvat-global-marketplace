import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/product-card";
import { Search, SlidersHorizontal, ArrowDownUp } from "lucide-react";

const searchSchema = z.object({ q: z.string().optional(), cat: z.string().optional() });

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Zoeken — Borvat" },
      { name: "description", content: "Zoek producten op Borvat." },
      { property: "og:title", content: "Zoeken — Borvat" },
      { property: "og:description", content: "Vind je product." },
    ],
  }),
  component: SearchPage,
});

const sorts = [
  { label: "Relevantie", value: "relevance" },
  { label: "Prijs: laag-hoog", value: "price_asc" },
  { label: "Prijs: hoog-laag", value: "price_desc" },
  { label: "Beste beoordeling", value: "rating" },
];

function SearchPage() {
  const { q, cat } = Route.useSearch();
  const navigate = useNavigate();
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [cats, setCats] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [sort, setSort] = useState("relevance");
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("categories").select("id,slug,name").order("sort_order").then(({ data }) => setCats(data ?? []));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("products")
        .select("id,title,price_cents,original_price_cents,image_url,rating,review_count")
        .eq("is_active", true);
      if (q) query = query.ilike("title", `%${q}%`);
      if (cat) query = query.eq("category_id", cat);
      if (priceMax) query = query.lte("price_cents", priceMax * 100);
      if (sort === "price_asc") query = query.order("price_cents", { ascending: true });
      else if (sort === "price_desc") query = query.order("price_cents", { ascending: false });
      else if (sort === "rating") query = query.order("rating", { ascending: false });
      else query = query.order("review_count", { ascending: false });
      const { data } = await query.limit(48);
      setResults(data ?? []);
      setLoading(false);
    })();
  }, [q, cat, sort, priceMax]);

  return (
    <div className="max-w-7xl mx-auto px-3 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              const search: { q?: string; cat?: string } = {};
              if (val) search.q = val;
              if (cat) search.cat = cat;
              navigate({ to: "/search", search });
            }}
            placeholder="Zoek producten..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <select
            value={cat ?? ""}
            onChange={(e) => {
              const search: { q?: string; cat?: string } = {};
              if (q) search.q = q;
              if (e.target.value) search.cat = e.target.value;
              navigate({ to: "/search", search });
            }}
            className="border border-border rounded px-2 py-1 text-sm bg-background"
          >
            <option value="">Alle categorieën</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Max prijs:</span>
          <select
            value={priceMax ?? ""}
            onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : null)}
            className="border border-border rounded px-2 py-1 text-sm bg-background"
          >
            <option value="">Geen limiet</option>
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
      </div>

      <h1 className="text-xl font-bold mb-4">
        {q ? `Resultaten voor "${q}"` : "Alle producten"}
        <span className="text-sm font-normal text-muted-foreground ml-2">({results.length})</span>
      </h1>

      {loading ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : results.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          Geen producten gevonden. Probeer een andere zoekterm of filter.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {results.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
