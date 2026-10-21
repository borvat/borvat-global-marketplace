import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "analyze_catalog",
  title: "Catalogus analyseren (verkoper)",
  description: "Statistieken over jouw producten: aantal, actief, drafts, gemiddelde prijs, producten zonder afbeelding of beschrijving.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) return err("Alleen verkopers kunnen dit gebruiken");
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id,price_cents,stock,image_url,description,is_active,is_draft,rating")
      .eq("seller_id", ctx.getUserId());
    if (error) return err(error.message);
    const total = data.length;
    const active = data.filter((p) => p.is_active && !p.is_draft).length;
    const drafts = data.filter((p) => p.is_draft).length;
    const noImage = data.filter((p) => !p.image_url).length;
    const noDesc = data.filter((p) => !p.description || p.description.trim().length < 20).length;
    const outOfStock = data.filter((p) => p.stock === 0).length;
    const avgPrice = total > 0 ? Math.round(data.reduce((s, p) => s + p.price_cents, 0) / total) : 0;
    const summary = { total, active, drafts, no_image: noImage, weak_description: noDesc, out_of_stock: outOfStock, avg_price_cents: avgPrice };
    await logAudit(ctx, "analyze_catalog", "success", { role, output: summary });
    return ok(`${total} producten, ${active} actief, ${drafts} concepten`, summary);
  },
});
