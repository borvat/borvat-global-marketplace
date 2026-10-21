import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { logAudit } from "../context";

export default defineTool({
  name: "get_shop_information",
  title: "Winkelinformatie",
  description: "Publieke informatie over een verkoper: naam, aantal actieve producten en gemiddelde rating.",
  inputSchema: { seller_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ seller_id }, ctx) => {
    const sb = supabaseForUser(ctx);
    const [{ data: profile }, { data: products }] = await Promise.all([
      sb.from("profiles").select("id,full_name").eq("id", seller_id).maybeSingle(),
      sb.from("products").select("id,rating,review_count").eq("seller_id", seller_id).eq("is_active", true),
    ]);
    if (!profile) return err("Verkoper niet gevonden");
    const count = products?.length ?? 0;
    const avgRating =
      count > 0
        ? products!.reduce((s, p) => s + (p.rating ?? 0), 0) / count
        : 0;
    await logAudit(ctx, "get_shop_information", "success", { input: { seller_id } });
    return ok(`Winkel: ${profile.full_name}`, {
      shop: { id: profile.id, name: profile.full_name, active_products: count, avg_rating: Number(avgRating.toFixed(2)) },
    });
  },
});
