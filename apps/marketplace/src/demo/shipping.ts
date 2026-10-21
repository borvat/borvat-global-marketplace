// DEMO DATA — NOT PRODUCTION. Frontend-only typed fixtures for M1V-0A.

export type DemoFulfillmentOrigin = {
  id: string;
  storeId: string;
  name: string;
  address: string;
  country: "NL" | "BE";
  cutoffLocal: string;
  timezone: string;
  handlingDays: number;
};

export type DemoShippingProfile = {
  id: string;
  storeId: string;
  name: string;
  markets: string[];
  freeShippingThresholdCents: number | null;
  baseRateCents: number;
  packages: string[];
};

export type DemoRateCard = {
  id: string;
  lane: string;
  carrier: string;
  weightBand: string;
  priceCents: number;
  transitProfile: string;
  validFrom: string;
  validTo: string | null;
};

export type DemoDeliveryPromise = {
  id: string;
  name: string;
  cutoffLocal: string;
  timezone: string;
  weeklySchedule: string;
  transitProfile: string;
  calendarProfile: string;
};

export type DemoTransitProfile = {
  id: string;
  name: string;
  minDays: number;
  maxDays: number;
  calendar: string;
  blackoutDates: string[];
};

export const demoFulfillmentOrigins: DemoFulfillmentOrigin[] = [
  {
    id: "org_001",
    storeId: "str_001",
    name: "Origin Rotterdam",
    address: "Waalhaven 120, 3087 BM Rotterdam",
    country: "NL",
    cutoffLocal: "16:00",
    timezone: "Europe/Amsterdam",
    handlingDays: 1,
  },
  {
    id: "org_002",
    storeId: "str_002",
    name: "Origin Antwerpen",
    address: "Noorderlaan 88, 2030 Antwerpen",
    country: "BE",
    cutoffLocal: "15:00",
    timezone: "Europe/Brussels",
    handlingDays: 2,
  },
];

export const demoShippingProfiles: DemoShippingProfile[] = [
  {
    id: "shp_001",
    storeId: "str_001",
    name: "NL Parcel Standard",
    markets: ["NL"],
    freeShippingThresholdCents: 5000,
    baseRateCents: 495,
    packages: ["Parcel S", "Parcel M"],
  },
  {
    id: "shp_002",
    storeId: "str_001",
    name: "BE Parcel Standard",
    markets: ["BE"],
    freeShippingThresholdCents: 7500,
    baseRateCents: 695,
    packages: ["Parcel M"],
  },
  {
    id: "shp_003",
    storeId: "str_001",
    name: "Bulky / Pallet (manual quote)",
    markets: ["NL", "BE"],
    freeShippingThresholdCents: null,
    baseRateCents: 0,
    packages: ["Pallet EUR", "Pallet half"],
  },
  {
    id: "shp_004",
    storeId: "str_002",
    name: "NL Outdoor Bulky",
    markets: ["NL"],
    freeShippingThresholdCents: null,
    baseRateCents: 1495,
    packages: ["Parcel L", "Pallet half"],
  },
];

export const demoRateCards: DemoRateCard[] = [
  { id: "rc_001", lane: "NL → NL", carrier: "PostNL", weightBand: "0–10 kg", priceCents: 495, transitProfile: "NL Next-day", validFrom: "2026-01-01", validTo: null },
  { id: "rc_002", lane: "NL → NL", carrier: "PostNL", weightBand: "10–30 kg", priceCents: 1195, transitProfile: "NL Next-day", validFrom: "2026-01-01", validTo: null },
  { id: "rc_003", lane: "NL → BE", carrier: "DPD", weightBand: "0–10 kg", priceCents: 695, transitProfile: "BeNeLux 2-day", validFrom: "2026-01-01", validTo: null },
  { id: "rc_004", lane: "BE → BE", carrier: "Bpost", weightBand: "0–10 kg", priceCents: 590, transitProfile: "BE Next-day", validFrom: "2026-03-01", validTo: null },
  { id: "rc_005", lane: "NL → NL", carrier: "Palletways", weightBand: "Pallet", priceCents: 0, transitProfile: "Pallet manual", validFrom: "2026-01-01", validTo: null },
];

export const demoDeliveryPromises: DemoDeliveryPromise[] = [
  { id: "dp_001", name: "Standaard — 1-2 werkdagen", cutoffLocal: "16:00", timezone: "Europe/Amsterdam", weeklySchedule: "Ma–Vr", transitProfile: "NL Next-day", calendarProfile: "NL Business" },
  { id: "dp_002", name: "Standaard — 2-3 werkdagen", cutoffLocal: "16:00", timezone: "Europe/Amsterdam", weeklySchedule: "Ma–Vr", transitProfile: "BeNeLux 2-day", calendarProfile: "NL Business" },
  { id: "dp_003", name: "Multi-parcel — 4-7 werkdagen", cutoffLocal: "14:00", timezone: "Europe/Amsterdam", weeklySchedule: "Ma–Do", transitProfile: "Bulky multi-parcel", calendarProfile: "NL Business" },
  { id: "dp_004", name: "Pallet — 3-5 werkdagen", cutoffLocal: "12:00", timezone: "Europe/Amsterdam", weeklySchedule: "Ma–Vr", transitProfile: "Pallet manual", calendarProfile: "NL Business" },
];

export const demoTransitProfiles: DemoTransitProfile[] = [
  { id: "tp_001", name: "NL Next-day", minDays: 1, maxDays: 2, calendar: "NL Business", blackoutDates: ["2026-12-25", "2026-12-26"] },
  { id: "tp_002", name: "BE Next-day", minDays: 1, maxDays: 2, calendar: "BE Business", blackoutDates: ["2026-07-21"] },
  { id: "tp_003", name: "BeNeLux 2-day", minDays: 2, maxDays: 3, calendar: "NL Business", blackoutDates: [] },
  { id: "tp_004", name: "Bulky multi-parcel", minDays: 4, maxDays: 7, calendar: "NL Business", blackoutDates: [] },
  { id: "tp_005", name: "Pallet manual", minDays: 3, maxDays: 5, calendar: "NL Business", blackoutDates: [] },
];
