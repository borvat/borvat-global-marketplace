// DEMO DATA — NOT PRODUCTION. Frontend-only typed fixtures for M1V-0A.

export type DemoQuotePackage = {
  id: string;
  label: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  qty: number;
};

export type DemoQuoteOffer = {
  id: string;
  version: number;
  priceCents: number;
  currency: "EUR";
  carrier: string;
  serviceLevel: string;
  etaText: string;
  expiresAt: string;
  status: "draft" | "offered" | "accepted" | "expired" | "superseded";
  conditions: string[];
  createdAt: string;
};

export type DemoQuoteRequest = {
  id: string;
  familyId: string;
  revision: number;
  storeId: string;
  productId: string;
  quantity: number;
  destination: {
    label: string;
    postcodeArea: string;
    city: string;
    country: "NL" | "BE";
    accessNotes: string;
  };
  packages: DemoQuotePackage[];
  status: "submitted" | "awaiting_offer" | "offered" | "accepted" | "expired";
  submittedAt: string;
  offers: DemoQuoteOffer[];
  acceptedTerms?: {
    offerId: string;
    acceptedAt: string;
    priceCents: number;
    etaText: string;
    note: string;
  };
};

export const demoQuoteRequests: DemoQuoteRequest[] = [
  {
    id: "mqr_001",
    familyId: "fam_a1",
    revision: 2,
    storeId: "str_001",
    productId: "prd_001",
    quantity: 1,
    destination: {
      label: "Pallet delivery — Utrecht",
      postcodeArea: "3512",
      city: "Utrecht",
      country: "NL",
      accessNotes: "Binnenstad, geen laadperron. Tailgate lift vereist.",
    },
    packages: [
      { id: "pkg_001", label: "Pallet EUR", lengthCm: 120, widthCm: 80, heightCm: 95, weightKg: 78, qty: 1 },
    ],
    status: "offered",
    submittedAt: "2026-07-22 10:14",
    offers: [
      {
        id: "off_001",
        version: 1,
        priceCents: 8900,
        currency: "EUR",
        carrier: "Palletways",
        serviceLevel: "Kerbside pallet",
        etaText: "3–5 werkdagen na acceptatie",
        expiresAt: "2026-07-24 10:14",
        status: "expired",
        conditions: ["Kerbside only", "Ontvanger aanwezig vereist"],
        createdAt: "2026-07-22 12:02",
      },
      {
        id: "off_002",
        version: 2,
        priceCents: 10400,
        currency: "EUR",
        carrier: "Palletways",
        serviceLevel: "Tailgate + kerbside",
        etaText: "3–5 werkdagen na acceptatie",
        expiresAt: "2026-07-28 18:00",
        status: "offered",
        conditions: ["Tailgate lift inbegrepen", "Geen dragen naar binnen", "Tijdvak 08:00–17:00"],
        createdAt: "2026-07-24 09:35",
      },
    ],
  },
  {
    id: "mqr_002",
    familyId: "fam_b7",
    revision: 1,
    storeId: "str_001",
    productId: "prd_002",
    quantity: 2,
    destination: {
      label: "Multi-parcel — Gent",
      postcodeArea: "9000",
      city: "Gent",
      country: "BE",
      accessNotes: "Tweede verdieping, geen lift.",
    },
    packages: [
      { id: "pkg_002", label: "Parcel L", lengthCm: 110, widthCm: 70, heightCm: 60, weightKg: 22, qty: 2 },
      { id: "pkg_003", label: "Parcel M", lengthCm: 80, widthCm: 50, heightCm: 40, weightKg: 11, qty: 2 },
    ],
    status: "accepted",
    submittedAt: "2026-07-18 15:40",
    offers: [
      {
        id: "off_003",
        version: 1,
        priceCents: 14900,
        currency: "EUR",
        carrier: "DPD",
        serviceLevel: "Multi-parcel 2-man",
        etaText: "4–7 werkdagen",
        expiresAt: "2026-07-21 18:00",
        status: "accepted",
        conditions: ["2-mans levering", "Levering tot aan de deur", "Trap max. 2 etages"],
        createdAt: "2026-07-19 08:20",
      },
    ],
    acceptedTerms: {
      offerId: "off_003",
      acceptedAt: "2026-07-20 09:11",
      priceCents: 14900,
      etaText: "4–7 werkdagen",
      note: "Commerciële voorwaarden vastgelegd — placeholder, geen order aangemaakt.",
    },
  },
  {
    id: "mqr_003",
    familyId: "fam_c3",
    revision: 1,
    storeId: "str_002",
    productId: "prd_007",
    quantity: 1,
    destination: {
      label: "Pallet delivery — Eindhoven",
      postcodeArea: "5611",
      city: "Eindhoven",
      country: "NL",
      accessNotes: "Achterom bereikbaar, oprit 3m breed.",
    },
    packages: [
      { id: "pkg_004", label: "Pallet half", lengthCm: 80, widthCm: 60, heightCm: 110, weightKg: 64, qty: 2 },
    ],
    status: "awaiting_offer",
    submittedAt: "2026-07-25 11:02",
    offers: [],
  },
];

export const quoteById = (id: string) => demoQuoteRequests.find((q) => q.id === id);
export const quotesForStore = (storeId: string) =>
  demoQuoteRequests.filter((q) => q.storeId === storeId);
