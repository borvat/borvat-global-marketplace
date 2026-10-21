import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";

export const Route = createFileRoute("/_authenticated/seller/products/$id/edit")({
  head: () => ({
    meta: [
      { title: "Product bewerken — marktje" },
      { name: "description", content: "Bewerk je product." },
      { property: "og:title", content: "Product bewerken — marktje" },
      { property: "og:description", content: "Werk je aanbod bij." },
    ],
  }),
  component: EditProductPage,
});

function EditProductPage() {
  const { id } = Route.useParams();
  return <ProductForm productId={id} />;
}
