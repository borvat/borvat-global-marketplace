import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "analyze_sales",
  title: "Verkoop analyseren (verkoper)",
  description: "Omzet en aantal verkopen over de laatste N dagen voor jouw items.",
  inputSchema: { days: z.number().int().min(1).max(365).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) return err("Alleen verkopers kunnen dit gebruiken");
    const since = new Date(Date.now() - (days ?? 30) * 86400_000).toISOString();
    const { data, error } = await supabaseForUser(ctx)
      .from("order_items")
      .select("id,price_cents,quantity,status,created_at,title")
      .eq("seller_id", ctx.getUserId())
      .gte("created_at", since);
    if (error) return err(error.message);
    const totalItems = data.reduce((s, i) => s + i.quantity, 0);
    const revenueCents = data.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.price_cents * i.quantity, 0);
    const cancelled = data.filter((i) => i.status === "cancelled").length;
    const delivered = data.filter((i) => i.status === "delivered").length;
    const summary = { period_days: days ?? 30, items_sold: totalItems, revenue_cents: revenueCents, delivered, cancelled };
    await logAudit(ctx, "analyze_sales", "success", { role, output: summary });
    return ok(`${totalItems} items, €${(revenueCents / 100).toFixed(2)} omzet`, summary);
  },
});
