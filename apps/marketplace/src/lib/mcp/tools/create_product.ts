import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "create_product_draft",
  title: "Product-concept maken (verkoper)",
  description:
    "Maakt een CONCEPT-product voor de ingelogde verkoper. Het product is NIET zichtbaar in de winkel totdat de verkoper het publiceert via het dashboard. Prijs in centen.",
  inputSchema: {
    title: z.string().trim().min(3),
    price_cents: z.number().int().min(1),
    stock: z.number().int().min(0),
    description: z.string().optional(),
    image_url: z.string().url().optional(),
    category_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) {
      await logAudit(ctx, "create_product_draft", "denied");
      return err("Alleen verkopers kunnen product-concepten maken");
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .insert({
        seller_id: ctx.getUserId(),
        title: input.title,
        price_cents: input.price_cents,
        stock: input.stock,
        description: input.description ?? null,
        image_url: input.image_url ?? null,
        category_id: input.category_id ?? null,
        is_active: false,
        is_draft: true,
      })
      .select()
      .single();
    if (error) return err(error.message);
    await logAudit(ctx, "create_product_draft", "success", { role, output: { id: data.id } });
    return ok(`Concept aangemaakt: ${data.title}. Publiceer via het dashboard.`, { product: data });
  },
});
