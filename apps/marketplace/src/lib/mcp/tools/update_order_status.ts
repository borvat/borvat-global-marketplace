import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, ok, err } from "../supabase";
import { requireRole, logAudit } from "../context";

export default defineTool({
  name: "update_order_status",
  title: "Bestelstatus bijwerken",
  description:
    "Werkt de status van één order-item bij (processing / shipped / delivered / cancelled). Alleen de verkoper van dat item mag dit. Bij 'shipped' zijn tracking-velden aanbevolen.",
  inputSchema: {
    order_item_id: z.string().uuid(),
    status: z.enum(["processing", "shipped", "delivered", "cancelled"]),
    tracking_carrier: z.string().max(50).optional(),
    tracking_code: z.string().max(100).optional(),
    tracking_url: z.string().url().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const role = await requireRole(ctx, "seller", "admin");
    if (!role) {
      await logAudit(ctx, "update_order_status", "denied");
      return err("Alleen verkopers kunnen orderstatus bijwerken");
    }
    const update: Record<string, unknown> = { status: input.status };
    if (input.tracking_carrier) update.tracking_carrier = input.tracking_carrier;
    if (input.tracking_code) update.tracking_code = input.tracking_code;
    if (input.tracking_url) update.tracking_url = input.tracking_url;
    const { data, error } = await supabaseForUser(ctx)
      .from("order_items")
      .update(update)
      .eq("id", input.order_item_id)
      .eq("seller_id", ctx.getUserId())
      .select()
      .single();
    if (error) {
      await logAudit(ctx, "update_order_status", "error", { role, error: error.message });
      return err(error.message);
    }
    await logAudit(ctx, "update_order_status", "success", { role, output: { id: data.id, status: data.status } });
    return ok(`Status → ${input.status}`, { item: data });
  },
});
