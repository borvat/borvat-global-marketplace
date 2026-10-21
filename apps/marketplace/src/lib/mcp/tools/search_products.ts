import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Zoek producten",
  description:
    "Zoek actieve producten in de Borvat-marketplace op titel. Geeft id, titel, prijs (in centen), voorraad en rating terug.",
  inputSchema: {
    query: z.string().min(1).describe("Zoekterm die in productitels moet voorkomen."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum aantal resultaten (standaard 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id,title,price_cents,stock,rating,review_count,seller_id")
      .ilike("title", `%${query}%`)
      .eq("is_active", true)
      .limit(limit ?? 20);
    if (error) return err(error.message);
    return ok(`${data.length} product(en) gevonden`, { products: data });
  },
});
