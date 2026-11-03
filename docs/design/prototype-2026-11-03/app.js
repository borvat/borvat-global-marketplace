/* BORVAT prototype — catalogue, offers, cart and one pricing model.
   The demo shop's own prices and titles are used verbatim so the prototype can be
   compared with the running storefront. Shipping and returns are illustrative and
   labelled as such in the interface. */

export const SHIPPING = { cents: 495, freeFromCents: 2900, label: "Bezorging" };

export const PRODUCTS = [
  { id: "prd_001", title: "Eiken eettafel 180×90 — natuurlijke afwerking", price: 74900, was: 89900, category: "Wonen", type: "Eetkamertafels", image: "assets/prd_001.jpg", specs: { Materiaal: "Massief eiken", Afmeting: "180 × 90 × 76 cm", Afwerking: "Geolied", Montage: "Zelfmontage, 20 min" } },
  { id: "prd_002", title: "Linnen bankstel 3-zits — antraciet", price: 129900, was: null, category: "Wonen", type: "Banken", image: "assets/prd_002.jpg", specs: { Bekleding: "Linnen mix", Breedte: "228 cm", Zitdiepte: "58 cm", Onderstel: "Massief hout" } },
  { id: "prd_003", title: "Wandkast massief grenen 200cm", price: 44900, was: null, category: "Wonen", type: "Kasten", image: "assets/prd_003.jpg", specs: { Materiaal: "Grenenhout", Hoogte: "200 cm", Breedte: "110 cm", Deuren: "2, softclose" } },
  { id: "prd_004", title: "Vloerlamp messing met linnen kap", price: 8900, was: 10500, category: "Wonen", type: "Verlichting", image: "assets/prd_004.jpg", specs: { Materiaal: "Messing", Hoogte: "160 cm", Fitting: "E27, max 40 W", Snoer: "2 m, stoffen" } },
  { id: "prd_005", title: "Wollen vloerkleed 200×300 — zand", price: 32900, was: null, category: "Wonen", type: "Textiel", image: "assets/prd_005.jpg", specs: { Materiaal: "100% wol", Afmeting: "200 × 300 cm", Poolhoogte: "12 mm", Reiniging: "Stofzuigen, vlekken deppen" } },
  { id: "prd_006", title: "Keramische plantenpot XL — off-white", price: 5900, was: null, category: "Wonen", type: "Accessoires", image: "assets/prd_006.jpg", specs: { Materiaal: "Keramiek", Diameter: "34 cm", Hoogte: "30 cm", Binnenpot: "Inbegrepen" } },
  { id: "prd_007", title: "Teakhouten tuinset 6 personen", price: 189900, was: 219900, category: "Tuin", type: "Tuinsets", image: "assets/prd_007.jpg", specs: { Materiaal: "Teakhout", Personen: "6", Tafel: "180 × 90 cm", Kussens: "Niet inbegrepen" } },
  { id: "prd_008", title: "Weerbestendige parasol 300cm", price: 24900, was: null, category: "Tuin", type: "Parasols", image: "assets/prd_008.jpg", specs: { Doek: "Polyester 220 g/m²", Doorsnede: "300 cm", Kleur: "Zand", Voet: "Niet inbegrepen" } },
  { id: "prd_009", title: "Vuurkorf gietijzer 60cm", price: 13900, was: null, category: "Tuin", type: "Buitenleven", image: "assets/prd_009.jpg", specs: { Materiaal: "Gietijzer", Doorsnede: "60 cm", Gewicht: "9 kg", Inclusief: "Rooster" } },
];

const SELLERS = {
  borvat: { name: "BORVAT", rating: 4.8, orders: 21400, delivery: "Morgen in huis", days: 1 },
  nordic: { name: "Nordic Home", rating: 4.6, orders: 3120, delivery: "Over 2 dagen", days: 2 },
  weba: { name: "Weba Wonen", rating: 4.4, orders: 860, delivery: "Morgen in huis", days: 1 },
  groen: { name: "Groenloods", rating: 4.5, orders: 1440, delivery: "Over 3 dagen", days: 3 },
};

/** Offers per product: the first is the featured one, the rest show the price ladder. */
export const OFFERS = {
  prd_001: [["borvat", 74900, 3], ["nordic", 76900, 2], ["weba", 79500, 1]],
  prd_002: [["borvat", 129900, 2], ["weba", 134900, 1]],
  prd_003: [["nordic", 44900, 4], ["borvat", 46900, 2]],
  prd_004: [["borvat", 8900, 5], ["weba", 9400, 3]],
  prd_005: [["weba", 32900, 2], ["nordic", 34900, 1]],
  prd_006: [["groen", 5900, 6], ["borvat", 6400, 3]],
  prd_007: [["borvat", 189900, 2], ["nordic", 194900, 1]],
  prd_008: [["groen", 24900, 4], ["weba", 25900, 2]],
  prd_009: [["borvat", 13900, 5], ["groen", 14500, 3]],
};

export const byId = (id) => PRODUCTS.find((p) => p.id === id);
export const sellerOf = (key) => SELLERS[key];

export function offersFor(productId) {
  return (OFFERS[productId] ?? []).map(([seller, cents, stock]) => ({
    seller, ...SELLERS[seller], priceCents: cents, stock,
  }));
}

export const eur = (cents) =>
  "€ " + (cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/* ---------- one pricing model, used by the cart and the product page ---------- */
export function priceCart(lines) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0);
  const shippingCents = subtotalCents === 0 || subtotalCents >= SHIPPING.freeFromCents ? 0 : SHIPPING.cents;
  const totalCents = subtotalCents + shippingCents;
  const vatCents = Math.round((totalCents * 21) / 121);
  return { subtotalCents, shippingCents, totalCents, vatCents };
}

/* ---------- cart persistence ---------- */
const KEY = "borvat.prototype.cart";

export function readCart() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function writeCart(lines) {
  localStorage.setItem(KEY, JSON.stringify(lines));
  paintBagCount();
}

export function addLine(productId, seller, unitCents, qty = 1) {
  const lines = readCart();
  const hit = lines.find((l) => l.productId === productId && l.seller === seller);
  if (hit) hit.qty += qty;
  else lines.push({ productId, seller, unitCents, qty });
  writeCart(lines);
}

export function setQty(index, qty) {
  const lines = readCart();
  if (!lines[index]) return;
  if (qty <= 0) lines.splice(index, 1);
  else lines[index].qty = qty;
  writeCart(lines);
}

export function paintBagCount() {
  const n = readCart().reduce((s, l) => s + l.qty, 0);
  document.querySelectorAll("[data-bag-count]").forEach((el) => (el.textContent = String(n)));
}

export function groupBySeller(lines) {
  const map = new Map();
  for (const line of lines) {
    const g = map.get(line.seller) ?? { seller: line.seller, lines: [], subtotalCents: 0 };
    g.lines.push(line);
    g.subtotalCents += line.unitCents * line.qty;
    map.set(line.seller, g);
  }
  return [...map.values()];
}

/* ---------- shared chrome ---------- */
export function renderChrome(active) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === active) a.classList.add("on");
  });
  paintBagCount();
}
