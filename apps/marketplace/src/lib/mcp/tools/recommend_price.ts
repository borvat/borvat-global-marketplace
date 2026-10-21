import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

/**
 * Price recommendation with mandatory cost inputs.
 * Returns `missing_cost_data` when critical inputs are absent instead of a misleading price.
 * The output is ALWAYS a suggestion (draft) — never auto-applied.
 */
export default defineTool({
  name: "recommend_price",
  title: "Prijs-aanbeveling (verkoper)",
  description:
    "Analyseert markt + kosten en stelt een prijs voor. Vereist purchase_cost_cents en minimum_margin_pct. Geeft `missing_cost_data` terug als kosten ontbreken. Wordt NIET toegepast — alleen als suggestie opgeslagen.",
  inputSchema: {
    product_id: z.string().uuid(),
    purchase_cost_cents: z.number().int().min(0).optional().describe("Inkoopprijs per stuk in centen"),
    shipping_cost_cents: z.number().int().min(0).optional().describe("Verzendkosten per stuk in centen"),
    marketplace_fee_pct: z.number().min(0).max(50).optional().describe("Marketplace commissie (%)"),
    vat_pct: z.number().min(0).max(30).optional().describe("BTW-percentage; default 21 (NL)"),
    minimum_margin_pct: z.number().min(0).max(90).optional().describe("Gewenste netto marge (%)"),
    reasoning: z.string().max(500).optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) return err("Alleen verkopers");

    // Enforce required cost inputs — refuse to guess.
    const missing: string[] = [];
    if (input.purchase_cost_cents === undefined) missing.push("purchase_cost_cents");
    if (input.minimum_margin_pct === undefined) missing.push("minimum_margin_pct");
    if (missing.length > 0) {
      await logAudit(ctx, "recommend_price", "denied", { role, input: { missing } });
      return {
        content: [{
          type: "text" as const,
          text: `Kan geen prijs voorstellen: ${missing.join(", ")} ontbreekt. Zonder deze data zou het voorstel misleidend zijn.`,
        }],
        structuredContent: { missing_cost_data: missing },
        isError: true,
      };
    }

    const sb = supabaseForUser(ctx);
    const { data: product } = await sb
      .from("products")
      .select("id,price_cents,category_id,seller_id,updated_at")
      .eq("id", input.product_id)
      .eq("seller_id", ctx.getUserId())
      .maybeSingle();
    if (!product) return err("Product niet gevonden of niet van jou");

    // Market benchmark from category peers (bounded by RLS: only published, active).
    let marketAvg: number | null = null;
    if (product.category_id) {
      const { data: peers } = await sb
        .from("products")
        .select("price_cents")
        .eq("category_id", product.category_id)
        .eq("is_active", true)
        .neq("id", product.id)
        .limit(50);
      if (peers && peers.length > 0) {
        marketAvg = Math.round(peers.reduce((s, p) => s + p.price_cents, 0) / peers.length);
      }
    }

    // Cost stack (all values in cents; percentages as fractions)
    const cost = input.purchase_cost_cents!;
    const shipping = input.shipping_cost_cents ?? 0;
    const feePct = (input.marketplace_fee_pct ?? 0) / 100;
    const vatPct = (input.vat_pct ?? 21) / 100;
    const marginPct = input.minimum_margin_pct! / 100;

    // Cost-plus floor: price such that (price - vat - fee - cost - shipping) / price >= marginPct
    // Solving: price * (1 - vatPct/(1+vatPct) - feePct - marginPct) >= cost + shipping
    // Simplified: net_ex_vat = price / (1+vatPct); target: net_ex_vat*(1-feePct) - (cost+shipping) >= net_ex_vat * marginPct
    // => net_ex_vat >= (cost+shipping) / (1 - feePct - marginPct)
    const denom = 1 - feePct - marginPct;
    if (denom <= 0) {
      return {
        content: [{
          type: "text" as const,
          text: "Marge + marketplace-fee ≥ 100%. Onmogelijk om winst te maken met deze inputs.",
        }],
        isError: true,
      };
    }
    const netExVatFloor = (cost + shipping) / denom;
    const priceFloor = Math.ceil(netExVatFloor * (1 + vatPct));

    // Final suggested price: max(floor, market_avg) if market data exists — never below floor.
    const suggestedPrice = marketAvg && marketAvg > priceFloor
      ? Math.round((priceFloor + marketAvg) / 2) // meet halfway with the market
      : priceFloor;

    const reasoning =
      `Kostenstack: inkoop €${(cost/100).toFixed(2)} + verzending €${(shipping/100).toFixed(2)}, ` +
      `${input.marketplace_fee_pct ?? 0}% fee, ${input.vat_pct ?? 21}% BTW, ` +
      `${input.minimum_margin_pct}% marge → floor €${(priceFloor/100).toFixed(2)}` +
      (marketAvg ? `; markt-gem €${(marketAvg/100).toFixed(2)}` : "") +
      (input.reasoning ? `. ${input.reasoning}` : "");

    const { data, error } = await sb
      .from("product_suggestions")
      .insert({
        seller_id: ctx.getUserId(),
        product_id: input.product_id,
        suggestion_type: "price",
        current_value: {
          price_cents: product.price_cents,
          market_avg_cents: marketAvg,
          cost_stack: { cost, shipping, feePct, vatPct, marginPct },
        },
        suggested_value: { price_cents: suggestedPrice, price_floor_cents: priceFloor },
        reasoning,
        product_updated_at_at_suggestion: product.updated_at,
      })
      .select()
      .single();
    if (error) return err(error.message);
    await logAudit(ctx, "recommend_price", "success", { role });
    return ok(
      `Prijsvoorstel €${(suggestedPrice/100).toFixed(2)} (floor €${(priceFloor/100).toFixed(2)}). Wacht op goedkeuring.`,
      { suggestion_id: data.id, suggested_price_cents: suggestedPrice, price_floor_cents: priceFloor, market_avg_cents: marketAvg },
    );
  },
});
