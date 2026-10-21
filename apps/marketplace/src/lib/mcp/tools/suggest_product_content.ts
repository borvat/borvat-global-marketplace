import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "suggest_product_content",
  title: "Content-suggestie (verkoper)",
  description:
    "Maakt een suggestie (draft) voor betere titel of beschrijving voor een van jouw producten. Wordt NIET automatisch toegepast — de verkoper moet accepteren via het dashboard.",
  inputSchema: {
    product_id: z.string().uuid(),
    suggestion_type: z.enum(["title", "description"]),
    suggested_value: z.string().min(3).max(4000),
    reasoning: z.string().max(500).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) return err("Alleen verkopers");
    const sb = supabaseForUser(ctx);
    const { data: product } = await sb
      .from("products")
      .select("id,title,description,seller_id,updated_at")
      .eq("id", input.product_id)
      .eq("seller_id", ctx.getUserId())
      .maybeSingle();
    if (!product) return err("Product niet gevonden of niet van jou");

    const current = input.suggestion_type === "title" ? product.title : product.description;
    const { data, error } = await sb
      .from("product_suggestions")
      .insert({
        seller_id: ctx.getUserId(),
        product_id: input.product_id,
        suggestion_type: input.suggestion_type,
        current_value: { value: current },
        suggested_value: { value: input.suggested_value },
        reasoning: input.reasoning ?? null,
        product_updated_at_at_suggestion: product.updated_at,
      })
      .select()
      .single();
    if (error) return err(error.message);
    await logAudit(ctx, "suggest_product_content", "success", { role, output: { id: data.id } });
    return ok("Suggestie opgeslagen — de verkoper beslist via het dashboard.", { suggestion_id: data.id });
  },
});
