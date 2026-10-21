export function formatEur(cents: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function productImage(url: string | null | undefined, seed: string) {
  if (url) return url;
  // deterministic SVG placeholder using the seed hash
  const hash = Array.from(seed).reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0);
  const hue = Math.abs(hash % 360);
  const hue2 = (hue + 40) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="hsl(${hue},70%,92%)"/><rect x="20" y="60" width="160" height="120" rx="12" fill="hsl(${hue2},60%,85%)"/><circle cx="100" cy="45" r="28" fill="hsl(${hue},55%,75%)"/><path d="M20 160 Q60 120 100 140 T180 150 V180 H20 Z" fill="hsl(${hue},50%,80%)"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
