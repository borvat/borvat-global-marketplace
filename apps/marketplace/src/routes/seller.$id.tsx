import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/product-card";

export const Route = createFileRoute("/seller/$id")({
  head: () => ({
    meta: [
      { title: "Verkoperspagina — marktje" },
      { name: "description", content: "Bekijk producten van deze verkoper." },
      { property: "og:title", content: "Verkoperspagina — marktje" },
      { property: "og:description", content: "Producten van deze verkoper." },
    ],
  }),
  component: SellerPublic,
});

function SellerPublic() {
  const { id } = Route.useParams();
  const [shop, setShop] = useState<{ name: string } | null>(null);
  const [products, setProducts] = useState<ProductCardData[]>([]);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("seller_shop_name,full_name")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) =>
        setShop({ name: data?.seller_shop_name || data?.full_name || "Verkoper" }),
      );
    supabase
      .from("products")
      .select("id,title,price_cents,original_price_cents,image_url,rating,review_count")
      .eq("seller_id", id)
      .eq("is_active", true)
      .then(({ data }) => setProducts(data ?? []));
  }, [id]);

  return (
    <div className="max-w-7xl mx-auto px-3 py-4">
      <div className="bg-card border border-border rounded p-4 mb-4">
        <div className="text-xs text-muted-foreground">Verkoper</div>
        <h1 className="text-2xl font-bold">{shop?.name}</h1>
      </div>
      {products.length === 0 ? (
        <p className="text-muted-foreground">Deze verkoper heeft nog geen actieve producten.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
      <Link to="/" className="text-brand text-sm mt-4 inline-block hover:underline">
        ← Naar de homepage
      </Link>
    </div>
  );
}
