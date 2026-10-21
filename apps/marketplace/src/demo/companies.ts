// DEMO DATA — NOT PRODUCTION. Frontend-only typed fixtures for M1V-0A.
// Nothing in this file is read from or written to the database.

export type DemoCompany = {
  id: string;
  name: string;
  country: "NL" | "BE";
  vatNumber: string;
  kvk: string;
  verification: "verified" | "pending" | "action_required";
  storeIds: string[];
  onboardedAt: string;
};

export type DemoStore = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  markets: string[];
  status: "active" | "paused" | "draft";
  verification: "verified" | "pending" | "action_required";
  channel: "borvat_direct" | "borvat_direct+bol_sandbox";
  channelStatus: "connected" | "sandbox" | "not_connected";
  accountStatus: "good_standing" | "under_review";
  shippingProfileCount: number;
  activeListings: number;
  rating: number;
};

export type DemoWarehouse = {
  id: string;
  storeId: string;
  name: string;
  city: string;
  country: "NL" | "BE";
  cutoffLocal: string;
  timezone: string;
};

export const demoCompanies: DemoCompany[] = [
  {
    id: "cmp_001",
    name: "Vandenberg Living B.V.",
    country: "NL",
    vatNumber: "NL8123.45.678.B01",
    kvk: "62148890",
    verification: "verified",
    storeIds: ["str_001", "str_002"],
    onboardedAt: "2025-11-04",
  },
  {
    id: "cmp_002",
    name: "Maasdal Trading BVBA",
    country: "BE",
    vatNumber: "BE0742.918.334",
    kvk: "0742918334",
    verification: "pending",
    storeIds: ["str_003"],
    onboardedAt: "2026-02-18",
  },
];

export const demoStores: DemoStore[] = [
  {
    id: "str_001",
    companyId: "cmp_001",
    name: "Vandenberg Home",
    slug: "vandenberg-home",
    markets: ["NL", "BE"],
    status: "active",
    verification: "verified",
    channel: "borvat_direct",
    channelStatus: "connected",
    accountStatus: "good_standing",
    shippingProfileCount: 3,
    activeListings: 6,
    rating: 4.7,
  },
  {
    id: "str_002",
    companyId: "cmp_001",
    name: "Vandenberg Outdoor",
    slug: "vandenberg-outdoor",
    markets: ["NL"],
    status: "active",
    verification: "verified",
    channel: "borvat_direct+bol_sandbox",
    channelStatus: "sandbox",
    accountStatus: "good_standing",
    shippingProfileCount: 2,
    activeListings: 3,
    rating: 4.4,
  },
  {
    id: "str_003",
    companyId: "cmp_002",
    name: "Maasdal Kitchen",
    slug: "maasdal-kitchen",
    markets: ["BE"],
    status: "draft",
    verification: "pending",
    channel: "borvat_direct",
    channelStatus: "not_connected",
    accountStatus: "under_review",
    shippingProfileCount: 1,
    activeListings: 1,
    rating: 0,
  },
];

export const demoWarehouses: DemoWarehouse[] = [
  {
    id: "wh_001",
    storeId: "str_001",
    name: "Origin Rotterdam",
    city: "Rotterdam",
    country: "NL",
    cutoffLocal: "16:00",
    timezone: "Europe/Amsterdam",
  },
  {
    id: "wh_002",
    storeId: "str_002",
    name: "Origin Antwerpen",
    city: "Antwerpen",
    country: "BE",
    cutoffLocal: "15:00",
    timezone: "Europe/Brussels",
  },
];

/** The seller currently "signed in" to the demo Seller Manager. */
export const demoActiveStoreId = "str_001";

export const companyById = (id: string) => demoCompanies.find((c) => c.id === id);
export const storeById = (id: string) => demoStores.find((s) => s.id === id);
