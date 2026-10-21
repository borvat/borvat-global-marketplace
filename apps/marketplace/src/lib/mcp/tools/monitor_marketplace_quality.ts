import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseAdmin, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "monitor_marketplace_quality",
  title: "Marketplace-kwaliteit (admin)",
  description: "Alleen admins. Overzicht van marketplace-kwaliteit: producten zonder afbeelding, inactieve verkopers, dubbele titels.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const role = await requireRole(ctx, "admin");
    if (!role) {
      await logAudit(ctx, "monitor_marketplace_quality", "denied");
      return err("Alleen admins");
    }
    const admin = await supabaseAdmin();
    const { data: products, error } = await admin
      .from("products")
      .select("id,title,image_url,is_active,seller_id")
      .eq("is_active", true);
    if (error) return err(error.message);
    const noImage = products.filter((p) => !p.image_url).length;
    const titleMap = new Map<string, number>();
    for (const p of products) titleMap.set(p.title.toLowerCase(), (titleMap.get(p.title.toLowerCase()) ?? 0) + 1);
    const duplicates = Array.from(titleMap.entries()).filter(([, c]) => c > 1).length;
    const summary = { total_active: products.length, no_image: noImage, duplicate_titles: duplicates };
    await logAudit(ctx, "monitor_marketplace_quality", "success", { role, output: summary });
    return ok("Marketplace-kwaliteit-rapport", summary);
  },
});
