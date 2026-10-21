import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";

export default defineTool({
  name: "list_seller_orders",
  title: "Inkomende bestellingen (verkoper)",
  description:
    "Geeft de order-items terug van producten die door de ingelogde verkoper zijn verkocht, optioneel gefilterd op status.",
  inputSchema: {
    status: z.enum(["new", "processing", "shipped", "delivered", "cancelled"]).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    let q = supabaseForUser(ctx)
      .from("order_items")
      .select("id,order_id,title,quantity,price_cents,status,tracking_carrier,tracking_code,tracking_url,created_at")
      .eq("seller_id", ctx.getUserId())
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(`${data.length} item(s)`, { items: data });
  },
});
