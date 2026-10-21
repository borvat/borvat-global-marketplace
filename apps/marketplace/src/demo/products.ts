// DEMO DATA — NOT PRODUCTION. Frontend-only typed fixtures for M1V-0A.

export type DemoProduct = {
  id: string;
  storeId: string;
  title: string;
  sku: string;
  ean: string;
  priceCents: number; // B2C price INCLUDES VAT; shipping is separate
  vatRate: number;
  currency: "EUR";
  stockAvailable: number;
  stockReserved: number;
  stockPublished: number;
  warehouseId: string;
  publicationState: "published" | "draft" | "review" | "unpublished";
  deliveryPromise: string;
  fulfillmentOrigin: string;
  buyBox: "winning" | "losing" | "not_competing";
  lowStockThreshold: number;
  updatedAt: string;
};

export type DemoStockMovement = {
  id: string;
  productId: string;
  at: string;
  type: "receipt" | "reservation" | "release" | "adjustment" | "shipment";
  qty: number;
  note: string;
};

export const demoProducts: DemoProduct[] = [
  {
    id: "prd_001",
    storeId: "str_001",
    title: "Eiken eettafel 180×90 — natuurlijke afwerking",
    sku: "VBH-TBL-180",
    ean: "8712345000011",
    priceCents: 74900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 12,
    stockReserved: 3,
    stockPublished: 9,
    warehouseId: "wh_001",
    publicationState: "published",
    deliveryPromise: "Pallet — 3-5 werkdagen",
    fulfillmentOrigin: "Origin Rotterdam",
    buyBox: "winning",
    lowStockThreshold: 5,
    updatedAt: "2026-07-21",
  },
  {
    id: "prd_002",
    storeId: "str_001",
    title: "Linnen bankstel 3-zits — antraciet",
    sku: "VBH-SOF-3AN",
    ean: "8712345000028",
    priceCents: 129900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 4,
    stockReserved: 2,
    stockPublished: 2,
    warehouseId: "wh_001",
    publicationState: "published",
    deliveryPromise: "Multi-parcel — 4-7 werkdagen",
    fulfillmentOrigin: "Origin Rotterdam",
    buyBox: "losing",
    lowStockThreshold: 5,
    updatedAt: "2026-07-23",
  },
  {
    id: "prd_003",
    storeId: "str_001",
    title: "Wandkast massief grenen 200cm",
    sku: "VBH-CAB-200",
    ean: "8712345000035",
    priceCents: 44900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 27,
    stockReserved: 1,
    stockPublished: 26,
    warehouseId: "wh_001",
    publicationState: "published",
    deliveryPromise: "Standaard — 2-3 werkdagen",
    fulfillmentOrigin: "Origin Rotterdam",
    buyBox: "winning",
    lowStockThreshold: 8,
    updatedAt: "2026-07-19",
  },
  {
    id: "prd_004",
    storeId: "str_001",
    title: "Vloerlamp messing met linnen kap",
    sku: "VBH-LMP-BRS",
    ean: "8712345000042",
    priceCents: 8900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 2,
    stockReserved: 1,
    stockPublished: 1,
    warehouseId: "wh_001",
    publicationState: "published",
    deliveryPromise: "Standaard — 1-2 werkdagen",
    fulfillmentOrigin: "Origin Rotterdam",
    buyBox: "not_competing",
    lowStockThreshold: 6,
    updatedAt: "2026-07-24",
  },
  {
    id: "prd_005",
    storeId: "str_001",
    title: "Wollen vloerkleed 200×300 — zand",
    sku: "VBH-RUG-2030",
    ean: "8712345000059",
    priceCents: 32900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 15,
    stockReserved: 0,
    stockPublished: 15,
    warehouseId: "wh_001",
    publicationState: "review",
    deliveryPromise: "Standaard — 2-3 werkdagen",
    fulfillmentOrigin: "Origin Rotterdam",
    buyBox: "not_competing",
    lowStockThreshold: 5,
    updatedAt: "2026-07-25",
  },
  {
    id: "prd_006",
    storeId: "str_001",
    title: "Keramische plantenpot XL — off-white",
    sku: "VBH-POT-XL",
    ean: "8712345000066",
    priceCents: 5900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 63,
    stockReserved: 4,
    stockPublished: 59,
    warehouseId: "wh_001",
    publicationState: "published",
    deliveryPromise: "Standaard — 1-2 werkdagen",
    fulfillmentOrigin: "Origin Rotterdam",
    buyBox: "winning",
    lowStockThreshold: 10,
    updatedAt: "2026-07-20",
  },
  {
    id: "prd_007",
    storeId: "str_002",
    title: "Teakhouten tuinset 6 personen",
    sku: "VBO-GRD-6P",
    ean: "8712345000073",
    priceCents: 189900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 3,
    stockReserved: 1,
    stockPublished: 2,
    warehouseId: "wh_002",
    publicationState: "published",
    deliveryPromise: "Pallet — 5-8 werkdagen",
    fulfillmentOrigin: "Origin Antwerpen",
    buyBox: "winning",
    lowStockThreshold: 4,
    updatedAt: "2026-07-22",
  },
  {
    id: "prd_008",
    storeId: "str_002",
    title: "Weerbestendige parasol 300cm",
    sku: "VBO-PAR-300",
    ean: "8712345000080",
    priceCents: 24900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 18,
    stockReserved: 2,
    stockPublished: 16,
    warehouseId: "wh_002",
    publicationState: "published",
    deliveryPromise: "Standaard — 2-4 werkdagen",
    fulfillmentOrigin: "Origin Antwerpen",
    buyBox: "losing",
    lowStockThreshold: 6,
    updatedAt: "2026-07-18",
  },
  {
    id: "prd_009",
    storeId: "str_002",
    title: "Vuurkorf gietijzer 60cm",
    sku: "VBO-FIR-60",
    ean: "8712345000097",
    priceCents: 13900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 0,
    stockReserved: 0,
    stockPublished: 0,
    warehouseId: "wh_002",
    publicationState: "unpublished",
    deliveryPromise: "Standaard — 2-4 werkdagen",
    fulfillmentOrigin: "Origin Antwerpen",
    buyBox: "not_competing",
    lowStockThreshold: 5,
    updatedAt: "2026-07-15",
  },
  {
    id: "prd_010",
    storeId: "str_003",
    title: "RVS keukenblok module 120cm",
    sku: "MDK-KIT-120",
    ean: "5412345000103",
    priceCents: 99900,
    vatRate: 21,
    currency: "EUR",
    stockAvailable: 5,
    stockReserved: 0,
    stockPublished: 0,
    warehouseId: "wh_002",
    publicationState: "draft",
    deliveryPromise: "Pallet — 6-10 werkdagen",
    fulfillmentOrigin: "Origin Antwerpen",
    buyBox: "not_competing",
    lowStockThreshold: 3,
    updatedAt: "2026-07-24",
  },
];

export const demoStockMovements: DemoStockMovement[] = [
  { id: "mv_001", productId: "prd_001", at: "2026-07-24 09:12", type: "reservation", qty: -1, note: "Cart reservation (demo)" },
  { id: "mv_002", productId: "prd_004", at: "2026-07-24 08:40", type: "shipment", qty: -2, note: "Shipment handed to carrier" },
  { id: "mv_003", productId: "prd_006", at: "2026-07-23 17:05", type: "receipt", qty: +40, note: "Inbound from supplier" },
  { id: "mv_004", productId: "prd_002", at: "2026-07-23 11:22", type: "release", qty: +1, note: "Reservation expired" },
  { id: "mv_005", productId: "prd_003", at: "2026-07-22 14:58", type: "adjustment", qty: -1, note: "Damage write-off" },
  { id: "mv_006", productId: "prd_007", at: "2026-07-22 10:31", type: "reservation", qty: -1, note: "Manual quote hold" },
];

export const productById = (id: string) => demoProducts.find((p) => p.id === id);
export const productsForStore = (storeId: string) =>
  demoProducts.filter((p) => p.storeId === storeId);
