import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "detect_listing_problems",
  title: "Listingproblemen detecteren (verkoper)",
  description: "Vindt jouw producten met korte titel, ontbrekende afbeelding, zwakke beschrijving of extreme prijs.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) return err("Alleen verkopers");
    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id,title,description,image_url,price_cents")
      .eq("seller_id", ctx.getUserId());
    if (error) return err(error.message);

    const problems = data.flatMap((p) => {
      const issues: string[] = [];
      if (p.title.length < 15) issues.push("short_title");
      if (!p.image_url) issues.push("missing_image");
      if (!p.description || p.description.trim().length < 40) issues.push("weak_description");
      if (p.price_cents < 50) issues.push("price_too_low");
      if (p.price_cents > 500000) issues.push("price_too_high");
      return issues.length ? [{ id: p.id, title: p.title, issues }] : [];
    });
    await logAudit(ctx, "detect_listing_problems", "success", { role, output: { count: problems.length } });
    return ok(`${problems.length} product(en) met problemen`, { problems });
  },
});
