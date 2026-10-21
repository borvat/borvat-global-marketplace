import type { Database } from "@/integrations/supabase/types";

export type RecentBuyerOrder = Pick<Database["public"]["Tables"]["orders"]["Row"], "id" | "created_at" | "status" | "total_cents">;

// Accept only a browser RLS client; callers must supply the verified auth user's ID.
type OrderReader = {
  from: (table: "orders") => {
    select: (columns: "id,created_at,status,total_cents") => {
      eq: (column: "user_id", value: string) => {
        order: (column: "created_at", options: { ascending: false }) => {
          limit: (count: number) => PromiseLike<{ data: RecentBuyerOrder[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

export function readRecentBuyerOrders(client: OrderReader, userId: string) {
  if (!userId.trim()) throw new Error("Een aangemeld account is vereist.");
  return client.from("orders").select("id,created_at,status,total_cents")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(3);
}

export function buyerOrderStatus(status: string): { label: string; tone: "neutral" | "success" | "danger" } {
  switch (status) {
    case "pending": return { label: "In afwachting", tone: "neutral" };
    case "new":
    case "paid": return { label: "Betaald", tone: "neutral" };
    case "processing": return { label: "In verwerking", tone: "neutral" };
    case "shipped": return { label: "Verzonden", tone: "neutral" };
    case "delivered": return { label: "Geleverd", tone: "success" };
    case "cancelled": return { label: "Geannuleerd", tone: "danger" };
    default: return { label: "Status onbekend", tone: "neutral" };
  }
}