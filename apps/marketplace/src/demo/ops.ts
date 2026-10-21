// DEMO DATA — NOT PRODUCTION. Frontend-only typed fixtures for M1V-0B.
// Nothing in this file is read from or written to the database.

export type DemoOrderStatus =
  | "new"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "return";

export type DemoOrder = {
  id: string;
  orderNumber: string;
  storeId: string;
  customerMasked: string;
  productId: string;
  productTitle: string;
  sku: string;
  quantity: number;
  amountCents: number;
  shippingMethod: string;
  handoverBy: string;
  labelStatus: "not_created" | "created" | "handed_over";
  packingSlip: boolean;
  status: DemoOrderStatus;
  placedAt: string;
  country: "NL" | "BE";
  invoiceRequested: boolean;
};

export const demoOrders: DemoOrder[] = [
  { id: "ord_1", orderNumber: "BRV-2026-004821", storeId: "str_001", customerMasked: "Customer #C-1041", productId: "prd_002", productTitle: "Linnen bankstel 3-zits — antraciet", sku: "VBH-SOF-3AN", quantity: 1, amountCents: 129900, shippingMethod: "Multi-parcel", handoverBy: "2026-07-27 12:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-26 08:14", country: "NL", invoiceRequested: false },
  { id: "ord_2", orderNumber: "BRV-2026-004820", storeId: "str_001", customerMasked: "Customer #C-1042", productId: "prd_001", productTitle: "Eiken eettafel 180×90", sku: "VBH-TBL-180", quantity: 1, amountCents: 74900, shippingMethod: "Pallet (manual quote)", handoverBy: "2026-07-28 12:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-26 07:02", country: "NL", invoiceRequested: true },
  { id: "ord_3", orderNumber: "BRV-2026-004815", storeId: "str_001", customerMasked: "Customer #C-1043", productId: "prd_003", productTitle: "Wandkast massief grenen 200cm", sku: "VBH-CAB-200", quantity: 2, amountCents: 89800, shippingMethod: "Parcel standard", handoverBy: "2026-07-26 16:00", labelStatus: "created", packingSlip: true, status: "processing", placedAt: "2026-07-25 15:44", country: "BE", invoiceRequested: false },
  { id: "ord_4", orderNumber: "BRV-2026-004809", storeId: "str_001", customerMasked: "Customer #C-1044", productId: "prd_006", productTitle: "Keramische plantenpot XL", sku: "VBH-POT-XL", quantity: 4, amountCents: 23600, shippingMethod: "Parcel standard", handoverBy: "2026-07-25 16:00", labelStatus: "handed_over", packingSlip: true, status: "shipped", placedAt: "2026-07-24 11:20", country: "NL", invoiceRequested: false },
  { id: "ord_5", orderNumber: "BRV-2026-004802", storeId: "str_001", customerMasked: "Customer #C-1045", productId: "prd_004", productTitle: "Vloerlamp messing met linnen kap", sku: "VBH-LMP-BRS", quantity: 1, amountCents: 8900, shippingMethod: "Parcel small", handoverBy: "2026-07-23 16:00", labelStatus: "handed_over", packingSlip: true, status: "delivered", placedAt: "2026-07-22 09:31", country: "NL", invoiceRequested: false },
  { id: "ord_6", orderNumber: "BRV-2026-004795", storeId: "str_001", customerMasked: "Customer #C-1046", productId: "prd_003", productTitle: "Wandkast massief grenen 200cm", sku: "VBH-CAB-200", quantity: 1, amountCents: 44900, shippingMethod: "Parcel standard", handoverBy: "—", labelStatus: "not_created", packingSlip: false, status: "cancelled", placedAt: "2026-07-21 18:05", country: "NL", invoiceRequested: false },
  { id: "ord_7", orderNumber: "BRV-2026-004788", storeId: "str_001", customerMasked: "Customer #C-1047", productId: "prd_006", productTitle: "Keramische plantenpot XL", sku: "VBH-POT-XL", quantity: 2, amountCents: 11800, shippingMethod: "Parcel standard", handoverBy: "—", labelStatus: "handed_over", packingSlip: true, status: "return", placedAt: "2026-07-18 13:12", country: "BE", invoiceRequested: true },
  { id: "ord_8", orderNumber: "BRV-2026-004781", storeId: "str_001", customerMasked: "Customer #C-1048", productId: "prd_001", productTitle: "Eiken eettafel 180×90", sku: "VBH-TBL-180", quantity: 1, amountCents: 74900, shippingMethod: "Pallet (manual quote)", handoverBy: "2026-07-27 12:00", labelStatus: "created", packingSlip: true, status: "processing", placedAt: "2026-07-25 10:02", country: "NL", invoiceRequested: false },
  { id: "ord_9", orderNumber: "BRV-2026-004771", storeId: "str_001", customerMasked: "Customer #C-1049", productId: "prd_004", productTitle: "Vloerlamp messing met linnen kap", sku: "VBH-LMP-BRS", quantity: 1, amountCents: 8900, shippingMethod: "Parcel small", handoverBy: "2026-07-26 16:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-26 08:03", country: "BE", invoiceRequested: false },
  { id: "ord_10", orderNumber: "BRV-2026-004770", storeId: "str_001", customerMasked: "Customer #C-1050", productId: "prd_005", productTitle: "Eetkamerstoel bouclé (set van 2)", sku: "VBH-CHR-BCL", quantity: 2, amountCents: 43800, shippingMethod: "Parcel standard", handoverBy: "2026-07-25 16:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-25 09:10", country: "NL", invoiceRequested: false },
  { id: "ord_11", orderNumber: "BRV-2026-004769", storeId: "str_001", customerMasked: "Customer #C-1051", productId: "prd_006", productTitle: "Keramische plantenpot XL", sku: "VBH-POT-XL", quantity: 3, amountCents: 17700, shippingMethod: "Parcel standard", handoverBy: "2026-07-24 16:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-24 10:17", country: "NL", invoiceRequested: false },
  { id: "ord_12", orderNumber: "BRV-2026-004768", storeId: "str_001", customerMasked: "Customer #C-1041", productId: "prd_001", productTitle: "Eiken eettafel 180×90", sku: "VBH-TBL-180", quantity: 1, amountCents: 74900, shippingMethod: "Pallet (manual quote)", handoverBy: "2026-07-23 16:00", labelStatus: "created", packingSlip: true, status: "processing", placedAt: "2026-07-23 11:24", country: "BE", invoiceRequested: true },
  { id: "ord_13", orderNumber: "BRV-2026-004767", storeId: "str_001", customerMasked: "Customer #C-1042", productId: "prd_002", productTitle: "Linnen bankstel 3-zits — antraciet", sku: "VBH-SOF-3AN", quantity: 2, amountCents: 259800, shippingMethod: "Multi-parcel", handoverBy: "2026-07-22 16:00", labelStatus: "created", packingSlip: true, status: "processing", placedAt: "2026-07-22 12:31", country: "NL", invoiceRequested: false },
  { id: "ord_14", orderNumber: "BRV-2026-004766", storeId: "str_001", customerMasked: "Customer #C-1043", productId: "prd_003", productTitle: "Wandkast massief grenen 200cm", sku: "VBH-CAB-200", quantity: 3, amountCents: 134700, shippingMethod: "Parcel standard", handoverBy: "2026-07-21 16:00", labelStatus: "handed_over", packingSlip: true, status: "shipped", placedAt: "2026-07-21 13:38", country: "NL", invoiceRequested: false },
  { id: "ord_15", orderNumber: "BRV-2026-004765", storeId: "str_001", customerMasked: "Customer #C-1044", productId: "prd_004", productTitle: "Vloerlamp messing met linnen kap", sku: "VBH-LMP-BRS", quantity: 1, amountCents: 8900, shippingMethod: "Parcel small", handoverBy: "2026-07-20 16:00", labelStatus: "handed_over", packingSlip: true, status: "shipped", placedAt: "2026-07-20 14:45", country: "BE", invoiceRequested: false },
  { id: "ord_16", orderNumber: "BRV-2026-004764", storeId: "str_001", customerMasked: "Customer #C-1045", productId: "prd_005", productTitle: "Eetkamerstoel bouclé (set van 2)", sku: "VBH-CHR-BCL", quantity: 2, amountCents: 43800, shippingMethod: "Parcel standard", handoverBy: "2026-07-19 16:00", labelStatus: "handed_over", packingSlip: true, status: "delivered", placedAt: "2026-07-19 15:52", country: "NL", invoiceRequested: true },
  { id: "ord_17", orderNumber: "BRV-2026-004763", storeId: "str_001", customerMasked: "Customer #C-1046", productId: "prd_006", productTitle: "Keramische plantenpot XL", sku: "VBH-POT-XL", quantity: 3, amountCents: 17700, shippingMethod: "Parcel standard", handoverBy: "2026-07-18 16:00", labelStatus: "handed_over", packingSlip: true, status: "delivered", placedAt: "2026-07-18 16:59", country: "NL", invoiceRequested: false },
  { id: "ord_18", orderNumber: "BRV-2026-004762", storeId: "str_001", customerMasked: "Customer #C-1047", productId: "prd_001", productTitle: "Eiken eettafel 180×90", sku: "VBH-TBL-180", quantity: 1, amountCents: 74900, shippingMethod: "Pallet (manual quote)", handoverBy: "2026-07-17 16:00", labelStatus: "not_created", packingSlip: false, status: "cancelled", placedAt: "2026-07-17 08:06", country: "BE", invoiceRequested: false },
  { id: "ord_19", orderNumber: "BRV-2026-004761", storeId: "str_001", customerMasked: "Customer #C-1048", productId: "prd_002", productTitle: "Linnen bankstel 3-zits — antraciet", sku: "VBH-SOF-3AN", quantity: 2, amountCents: 259800, shippingMethod: "Multi-parcel", handoverBy: "2026-07-16 16:00", labelStatus: "handed_over", packingSlip: true, status: "return", placedAt: "2026-07-16 09:13", country: "NL", invoiceRequested: false },
  { id: "ord_20", orderNumber: "BRV-2026-004760", storeId: "str_001", customerMasked: "Customer #C-1052", productId: "prd_003", productTitle: "Wandkast massief grenen 200cm", sku: "VBH-CAB-200", quantity: 3, amountCents: 134700, shippingMethod: "Parcel standard", handoverBy: "2026-07-15 16:00", labelStatus: "created", packingSlip: true, status: "processing", placedAt: "2026-07-15 10:20", country: "NL", invoiceRequested: true },
  { id: "ord_21", orderNumber: "BRV-2026-004759", storeId: "str_001", customerMasked: "Customer #C-1049", productId: "prd_004", productTitle: "Vloerlamp messing met linnen kap", sku: "VBH-LMP-BRS", quantity: 1, amountCents: 8900, shippingMethod: "Parcel small", handoverBy: "2026-07-14 16:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-14 11:27", country: "BE", invoiceRequested: false },
  { id: "ord_22", orderNumber: "BRV-2026-004758", storeId: "str_001", customerMasked: "Customer #C-1050", productId: "prd_005", productTitle: "Eetkamerstoel bouclé (set van 2)", sku: "VBH-CHR-BCL", quantity: 2, amountCents: 43800, shippingMethod: "Parcel standard", handoverBy: "2026-07-13 16:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-13 12:34", country: "NL", invoiceRequested: false },
  { id: "ord_23", orderNumber: "BRV-2026-004757", storeId: "str_001", customerMasked: "Customer #C-1051", productId: "prd_006", productTitle: "Keramische plantenpot XL", sku: "VBH-POT-XL", quantity: 3, amountCents: 17700, shippingMethod: "Parcel standard", handoverBy: "2026-07-26 16:00", labelStatus: "not_created", packingSlip: false, status: "new", placedAt: "2026-07-26 13:41", country: "NL", invoiceRequested: false },
  { id: "ord_24", orderNumber: "BRV-2026-004756", storeId: "str_001", customerMasked: "Customer #C-1041", productId: "prd_001", productTitle: "Eiken eettafel 180×90", sku: "VBH-TBL-180", quantity: 1, amountCents: 74900, shippingMethod: "Pallet (manual quote)", handoverBy: "2026-07-25 16:00", labelStatus: "created", packingSlip: true, status: "processing", placedAt: "2026-07-25 14:48", country: "BE", invoiceRequested: true },
];

export type DemoQuestion = {
  id: string;
  storeId: string;
  subject: string;
  customerMasked: string;
  productSku: string;
  receivedAt: string;
  dueIn: string;
  status: "open" | "waiting_customer" | "resolved";
  priority: "low" | "normal" | "high";
};

export const demoQuestions: DemoQuestion[] = [
  { id: "q_1", storeId: "str_001", subject: "Kan het bankstel naar de tweede verdieping?", customerMasked: "Customer #C-1041", productSku: "VBH-SOF-3AN", receivedAt: "2026-07-26 08:52", dueIn: "13 h", status: "open", priority: "high" },
  { id: "q_2", storeId: "str_001", subject: "When do I get the shipping price for the dining table?", customerMasked: "Customer #C-1042", productSku: "VBH-TBL-180", receivedAt: "2026-07-25 09:02", dueIn: "4 h", status: "open", priority: "normal" },
  { id: "q_3", storeId: "str_001", subject: "Does the wall cabinet fit a 205 cm alcove?", customerMasked: "Customer #C-1043", productSku: "VBH-CAB-200", receivedAt: "2026-07-19 15:02", dueIn: "—", status: "resolved", priority: "low" },
  { id: "q_4", storeId: "str_001", subject: "Is the planter frost-resistant?", customerMasked: "Customer #C-1044", productSku: "VBH-POT-XL", receivedAt: "2026-07-24 17:40", dueIn: "22 h", status: "waiting_customer", priority: "normal" },
  { id: "q_5", storeId: "str_001", subject: "Delivery time to Belgium?", customerMasked: "Customer #C-1046", productSku: "VBH-POT-XL", receivedAt: "2026-07-25 14:15", dueIn: "15 h", status: "resolved", priority: "high" },
  { id: "q_6", storeId: "str_001", subject: "Can the cabinet be cut to size?", customerMasked: "Customer #C-1047", productSku: "VBH-TBL-180", receivedAt: "2026-07-20 15:16", dueIn: "18 h", status: "open", priority: "low" },
  { id: "q_7", storeId: "str_001", subject: "Is mounting hardware included?", customerMasked: "Customer #C-1048", productSku: "VBH-SOF-3AN", receivedAt: "2026-07-21 16:17", dueIn: "21 h", status: "waiting_customer", priority: "normal" },
  { id: "q_8", storeId: "str_001", subject: "Is there a warranty certificate?", customerMasked: "Customer #C-1052", productSku: "VBH-CAB-200", receivedAt: "2026-07-22 09:18", dueIn: "0 h", status: "resolved", priority: "high" },
  { id: "q_9", storeId: "str_001", subject: "Can I exchange the colour?", customerMasked: "Customer #C-1049", productSku: "VBH-LMP-BRS", receivedAt: "2026-07-23 10:10", dueIn: "3 h", status: "open", priority: "low" },
  { id: "q_10", storeId: "str_001", subject: "Will the old sofa be taken away?", customerMasked: "Customer #C-1050", productSku: "VBH-CHR-BCL", receivedAt: "2026-07-24 11:11", dueIn: "6 h", status: "waiting_customer", priority: "normal" },
  { id: "q_11", storeId: "str_001", subject: "How heavy is the parcel?", customerMasked: "Customer #C-1051", productSku: "VBH-POT-XL", receivedAt: "2026-07-25 12:12", dueIn: "9 h", status: "resolved", priority: "high" },
  { id: "q_12", storeId: "str_001", subject: "Can I collect from the warehouse?", customerMasked: "Customer #C-1041", productSku: "VBH-TBL-180", receivedAt: "2026-07-20 13:13", dueIn: "12 h", status: "open", priority: "low" },
];

export type DemoReview = {
  id: string;
  productSku: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  at: string;
  answered: boolean;
};

export const demoReviews: DemoReview[] = [
  { id: "rv_1", productSku: "VBH-TBL-180", rating: 5, title: "Prachtige tafel", body: "Massief en goed verpakt geleverd.", author: "Customer #C-1053", at: "2026-07-24", answered: true },
  { id: "rv_2", productSku: "VBH-SOF-3AN", rating: 3, title: "Delivery took a long time", body: "Sofa is beautiful, but transport took 9 days.", author: "Customer #C-1054", at: "2026-07-22", answered: false },
  { id: "rv_3", productSku: "VBH-POT-XL", rating: 5, title: "Top kwaliteit", body: "Zwaarder dan verwacht, erg mooi.", author: "Customer #C-1055", at: "2026-07-21", answered: true },
  { id: "rv_4", productSku: "VBH-CAB-200", rating: 4, title: "Goede kast", body: "Montage duurde even maar resultaat is prima.", author: "Customer #C-1056", at: "2026-07-18", answered: false },
  { id: "rv_5", productSku: "VBH-LMP-BRS", rating: 2, title: "Kap beschadigd", body: "Linnen kap had een vlek, snel opgelost door service.", author: "Customer #C-1057", at: "2026-07-15", answered: true },
];

export type DemoServiceStandard = {
  id: string;
  metric: string;
  score: string;
  norm: string;
  status: "ok" | "at_risk" | "breached";
  trend: "up" | "down" | "flat";
};

export const demoServiceStandards: DemoServiceStandard[] = [
  { id: "ss_1", metric: "On-time delivery", score: "96,4%", norm: "≥ 95%", status: "ok", trend: "up" },
  { id: "ss_2", metric: "Cancellations", score: "1,2%", norm: "≤ 2%", status: "ok", trend: "flat" },
  { id: "ss_3", metric: "Response time (24h)", score: "88,0%", norm: "≥ 90%", status: "at_risk", trend: "down" },
  { id: "ss_4", metric: "Track & trace supplied", score: "99,1%", norm: "≥ 98%", status: "ok", trend: "up" },
  { id: "ss_5", metric: "Return handling", score: "72,0%", norm: "≥ 85%", status: "breached", trend: "down" },
  { id: "ss_6", metric: "Review score", score: "4,3 / 5", norm: "≥ 4,0", status: "ok", trend: "flat" },
];

export type DemoInvoice = {
  id: string;
  period: string;
  type: "commission" | "payout" | "advertising" | "correction";
  amountCents: number;
  status: "paid" | "open" | "processing";
  issuedAt: string;
};

export const demoInvoices: DemoInvoice[] = [
  { id: "inv_1", period: "01–15 Jul 2026", type: "payout", amountCents: 1842300, status: "paid", issuedAt: "2026-07-16" },
  { id: "inv_2", period: "01–15 Jul 2026", type: "commission", amountCents: -221000, status: "paid", issuedAt: "2026-07-16" },
  { id: "inv_3", period: "16–31 Jul 2026", type: "payout", amountCents: 1104500, status: "processing", issuedAt: "2026-08-01" },
  { id: "inv_4", period: "16–31 Jul 2026", type: "advertising", amountCents: -18900, status: "open", issuedAt: "2026-08-01" },
  { id: "inv_5", period: "16–30 Jun 2026", type: "correction", amountCents: -4200, status: "paid", issuedAt: "2026-07-01" },
];

export type DemoPromotion = {
  id: string;
  name: string;
  type: "deal_of_the_day" | "campaign" | "bundle" | "price_drop";
  window: string;
  products: number;
  discount: string;
  status: "active" | "pending" | "draft" | "expired";
};

export const demoPromotions: DemoPromotion[] = [
  { id: "pr_1", name: "Zomer Woonweken", type: "campaign", window: "20 Jul – 03 Aug", products: 4, discount: "−15%", status: "active" },
  { id: "pr_2", name: "Deal van de dag — vloerlamp", type: "deal_of_the_day", window: "28 Jul", products: 1, discount: "−25%", status: "pending" },
  { id: "pr_3", name: "Tafel + stoelen bundel", type: "bundle", window: "01 Aug – 30 Aug", products: 2, discount: "−10%", status: "draft" },
  { id: "pr_4", name: "Voorjaarsopruiming", type: "price_drop", window: "01 Apr – 30 Apr", products: 6, discount: "−20%", status: "expired" },
];

export type DemoAdCampaign = {
  id: string;
  name: string;
  objective: "sales" | "visibility";
  budgetCents: number;
  spentCents: number;
  impressions: number;
  clicks: number;
  acos: string;
  status: "active" | "paused" | "draft";
};

export const demoAdCampaigns: DemoAdCampaign[] = [
  { id: "ad_1", name: "Eettafels — merkzoekwoorden", objective: "sales", budgetCents: 30000, spentCents: 21440, impressions: 48210, clicks: 1244, acos: "8,2%", status: "active" },
  { id: "ad_2", name: "Banken — categorie", objective: "visibility", budgetCents: 25000, spentCents: 9820, impressions: 31120, clicks: 610, acos: "14,7%", status: "active" },
  { id: "ad_3", name: "Verlichting — retargeting", objective: "sales", budgetCents: 10000, spentCents: 0, impressions: 0, clicks: 0, acos: "—", status: "paused" },
];

export const demoRevenueSeries = [
  { label: "wk22", value: 8420 },
  { label: "wk23", value: 9310 },
  { label: "wk24", value: 7880 },
  { label: "wk25", value: 11240 },
  { label: "wk26", value: 12890 },
  { label: "wk27", value: 10440 },
  { label: "wk28", value: 13980 },
  { label: "wk29", value: 15120 },
];

export const demoOrdersSeries = [
  { label: "wk22", value: 24 },
  { label: "wk23", value: 28 },
  { label: "wk24", value: 21 },
  { label: "wk25", value: 33 },
  { label: "wk26", value: 37 },
  { label: "wk27", value: 30 },
  { label: "wk28", value: 41 },
  { label: "wk29", value: 44 },
];

export const demoReturnsSeries = [
  { label: "wk22", value: 2 },
  { label: "wk23", value: 3 },
  { label: "wk24", value: 1 },
  { label: "wk25", value: 4 },
  { label: "wk26", value: 2 },
  { label: "wk27", value: 3 },
  { label: "wk28", value: 2 },
  { label: "wk29", value: 3 },
];

export const demoCountrySplit = [
  { label: "NL", value: 71 },
  { label: "BE", value: 24 },
  { label: "DE", value: 5 },
];

export const demoTopProducts = [
  { sku: "VBH-TBL-180", title: "Eiken eettafel 180×90", units: 34, revenueCents: 2546600 },
  { sku: "VBH-POT-XL", title: "Keramische plantenpot XL", units: 128, revenueCents: 755200 },
  { sku: "VBH-CAB-200", title: "Wandkast massief grenen", units: 21, revenueCents: 942900 },
  { sku: "VBH-SOF-3AN", title: "Linnen bankstel 3-zits", units: 6, revenueCents: 779400 },
  { sku: "VBH-RUG-2030", title: "Wollen vloerkleed 200×300", units: 12, revenueCents: 394800 },
];

export const ordersForStore = (storeId: string) => demoOrders.filter((o) => o.storeId === storeId);
export const questionsForStore = (storeId: string) =>
  demoQuestions.filter((q) => q.storeId === storeId);
