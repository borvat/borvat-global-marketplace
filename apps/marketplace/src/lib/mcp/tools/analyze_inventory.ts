import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "analyze_inventory",
  title: "Voorraad analyseren (verkoper)",
  description: "Producten met lage of geen voorraad.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) return err("Alleen verkopers");
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id,title,stock")
      .eq("seller_id", ctx.getUserId())
      .eq("is_active", true)
      .lte("stock", 5)
      .order("stock");
    if (error) return err(error.message);
    const out = data.filter((p) => p.stock === 0);
    const low = data.filter((p) => p.stock > 0);
    await logAudit(ctx, "analyze_inventory", "success", { role });
    return ok(`${out.length} nihil, ${low.length} laag`, { out_of_stock: out, low_stock: low });
  },
});
