export const ORDER_STATUS_FLOW = ["new", "processing", "shipped", "delivered"] as const;
export type OrderStatus = "new" | "processing" | "shipped" | "delivered" | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Betaald",
  processing: "In verwerking",
  shipped: "Verzonden",
  delivered: "Geleverd",
  cancelled: "Geannuleerd",
};

export const STATUS_BADGE: Record<OrderStatus, string> = {
  new: "bg-accent-yellow/30 text-accent-foreground",
  processing: "bg-brand/15 text-brand",
  shipped: "bg-brand/20 text-brand",
  delivered: "bg-success/20 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};
