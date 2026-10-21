import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";

export const Route = createFileRoute("/_authenticated/seller/products/new")({
  head: () => ({
    meta: [
      { title: "Nieuw product — marktje" },
      { name: "description", content: "Voeg een nieuw product toe." },
      { property: "og:title", content: "Nieuw product — marktje" },
      { property: "og:description", content: "Start met verkopen." },
    ],
  }),
  component: () => <ProductForm />,
});
