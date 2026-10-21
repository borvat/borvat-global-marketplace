import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, readMemory, logAudit } from "../context";

export default defineTool({
  name: "get_recommendations",
  title: "Aanbevelingen (koper)",
  description: "Persoonlijke productaanbevelingen op basis van eerdere bestellingen en opgeslagen voorkeuren.",
  inputSchema: { limit: z.number().int().min(1).max(20).optional() },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const role = await requireRole(ctx, "buyer", "seller", "admin");
    if (!role) return err("Niet geautoriseerd");
    const sb = supabaseForUser(ctx);
    const prefs = await readMemory(ctx, "buyer_prefs");
    const { data: recentOrders } = await sb
      .from("order_items")
      .select("product_id, title")
      .eq("buyer_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(5);

    const seenCats: string[] = [];
    if (recentOrders?.length) {
      const ids = recentOrders.map((o) => o.product_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data: cats } = await sb.from("products").select("category_id").in("id", ids);
        for (const c of cats ?? []) if (c.category_id) seenCats.push(c.category_id);
      }
    }

    let q = sb.from("products").select("id,title,price_cents,rating").eq("is_active", true).eq("is_draft", false);
    if (seenCats.length) q = q.in("category_id", seenCats);
    const { data, error } = await q.order("rating", { ascending: false, nullsFirst: false }).limit(limit ?? 10);
    if (error) return err(error.message);

    await logAudit(ctx, "get_recommendations", "success", { role, output: { count: data.length } });
    return ok(`${data.length} aanbeveling(en)`, {
      recommendations: data,
      based_on: { recent_orders: recentOrders?.length ?? 0, saved_preferences: prefs.length },
    });
  },
});
