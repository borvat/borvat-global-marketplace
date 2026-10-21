import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { formatEur } from "@/lib/format";

type StatusInput = "processing" | "shipped" | "delivered" | "cancelled";

interface UpdateInput {
  itemId: string;
  status: StatusInput;
  tracking?: {
    carrier: string;
    code: string;
    url?: string | null;
  };
}

const TEMPLATE_BY_STATUS: Record<string, string> = {
  processing: "order-processing",
  shipped: "order-shipped",
  delivered: "order-delivered",
};

export const updateOrderItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const update = {
      status: data.status,
      ...(data.tracking
        ? {
            tracking_carrier: data.tracking.carrier,
            tracking_code: data.tracking.code,
            tracking_url: data.tracking.url || null,
          }
        : {}),
    };



    const { data: item, error } = await supabase
      .from("order_items")
      .update(update)
      .eq("id", data.itemId)
      .eq("seller_id", userId)
      .select(
        "id,title,quantity,price_cents,order_id,status,tracking_carrier,tracking_code,tracking_url,orders(user_id,total_cents)",
      )
      .single();

    if (error) throw new Error(error.message);
    if (!item) throw new Error("Item niet gevonden");

    const templateName = TEMPLATE_BY_STATUS[data.status];
    if (!templateName) return { ok: true, emailed: false };

    const order = (item as any).orders as { user_id: string; total_cents: number } | null;
    if (!order) return { ok: true, emailed: false };

    // Buyer profile for email + name
    const { data: profile } = await supabase
      .from("profiles")
      .select("email,full_name")
      .eq("id", order.user_id)
      .maybeSingle();

    if (!profile?.email) return { ok: true, emailed: false };

    const siteUrl =
      process.env.SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      "https://borvatshop.com";

    const orderNumber = `ORD-${String((item as any).order_id).slice(0, 8).toUpperCase()}`;
    const templateData: Record<string, any> = {
      siteUrl,
      orderNumber,
      customerName: profile.full_name || "klant",
      items: [{ title: (item as any).title, quantity: (item as any).quantity }],
      orderTotal: formatEur((item as any).price_cents * (item as any).quantity),
    };

    if (data.status === "shipped") {
      templateData.trackingCarrier = (item as any).tracking_carrier ?? "";
      templateData.trackingCode = (item as any).tracking_code ?? "";
      templateData.trackingUrl = (item as any).tracking_url ?? undefined;
    }

    try {
      await sendTemplateEmail(templateName, profile.email, {
        templateData,
        idempotencyKey: `order-item-${(item as any).id}-${data.status}`,
      });
      return { ok: true, emailed: true };
    } catch (e) {
      console.error("[order-status email]", e);
      return { ok: true, emailed: false };
    }
  });
