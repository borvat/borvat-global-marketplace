import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, ok, err } from "../supabase";

export default defineTool({
  name: "list_my_products",
  title: "Mijn producten (verkoper)",
  description: "Geeft alle producten van de ingelogde verkoper terug.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id,title,price_cents,stock,is_active,created_at")
      .eq("seller_id", ctx.getUserId())
      .order("created_at", { ascending: false });
    if (error) return err(error.message);
    return ok(`${data.length} product(en)`, { products: data });
  },
});
