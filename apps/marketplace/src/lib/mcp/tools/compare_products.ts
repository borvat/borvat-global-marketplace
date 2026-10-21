import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { logAudit } from "../context";

export default defineTool({
  name: "compare_products",
  title: "Producten vergelijken",
  description: "Vergelijk 2-5 producten op prijs, voorraad, rating en verkoper.",
  inputSchema: {
    ids: z.array(z.string().uuid()).min(2).max(5).describe("Product-IDs om te vergelijken."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ids }, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id,title,price_cents,stock,rating,review_count,seller_id,description")
      .in("id", ids);
    if (error) return err(error.message);
    await logAudit(ctx, "compare_products", "success", { input: { ids }, output: { count: data.length } });
    return ok(`${data.length} product(en) vergeleken`, { products: data });
  },
});
