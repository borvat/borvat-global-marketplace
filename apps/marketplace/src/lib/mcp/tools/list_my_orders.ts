import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, ok, err } from "../supabase";

export default defineTool({
  name: "list_my_orders",
  title: "Mijn bestellingen (koper)",
  description:
    "Geeft alle bestellingen van de ingelogde koper, inclusief items met status en tracking-info.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const sb = supabaseForUser(ctx);
    const { data: orders, error } = await sb
      .from("orders")
      .select("id,created_at,total_cents,order_items(id,title,quantity,price_cents,status,tracking_carrier,tracking_code,tracking_url)")
      .eq("buyer_id", ctx.getUserId())
      .order("created_at", { ascending: false });
    if (error) return err(error.message);
    return ok(`${orders.length} bestelling(en)`, { orders });
  },
});
