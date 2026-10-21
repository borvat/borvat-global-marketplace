import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";

export default defineTool({
  name: "get_product",
  title: "Product-details",
  description: "Haal de volledige details op van één product via zijn ID.",
  inputSchema: { product_id: z.string().uuid().describe("Product-ID (UUID).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ product_id }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("*")
      .eq("id", product_id)
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("Product niet gevonden");
    return ok(data.title, { product: data });
  },
});
