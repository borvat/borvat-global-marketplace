/**
 * Demo catalogue media (v6).
 *
 * These are generated studio renders and generated editorial scenes, made for the isolated demo
 * catalogue only. The interface labels them as generated demo imagery and ATTRIBUTION.md records how
 * they were produced. They are not supplier photography and describe no real shipment.
 */
export const DEMO_MEDIA: Record<string, string> = {
  prd_001: "/demo/v6/p01-tafel.jpg",
  prd_002: "/demo/v6/p02-bank.jpg",
  prd_003: "/demo/v6/p11-kast.jpg",
  prd_004: "/demo/v6/p05-vloerlamp.jpg",
  prd_005: "/demo/v6/p07-vloerkleed.jpg",
  prd_006: "/demo/v6/p04-pot.jpg",
  prd_007: "/demo/v6/p03-tuinset.jpg",
  prd_008: "/demo/v6/p13-parasol.jpg",
  prd_009: "/demo/v6/p14-vuurkorf.jpg",
  prd_010: "/demo/v6/p06-tafellamp.jpg",
  prd_011: "/demo/v6/p09-servies.jpg",
  prd_012: "/demo/v6/p12-mand.jpg",
  prd_013: "/demo/v6/p08-plaid.jpg",
  prd_014: "/demo/v6/p10-braadpan.jpg",
};

export type DemoCategory = { key: string; label: string; image: string; blurb: string };

export const DEMO_CATEGORIES: DemoCategory[] = [
  { key: "Wonen", label: "Wonen", image: "/demo/v6/c1-wonen.jpg", blurb: "Meubels en woonaccessoires" },
  { key: "Tuin", label: "Tuin", image: "/demo/v6/c2-tuin.jpg", blurb: "Buitenmeubels en planten" },
  { key: "Verlichting", label: "Verlichting", image: "/demo/v6/c3-verlichting.jpg", blurb: "Lampen voor elke kamer" },
  { key: "Textiel", label: "Textiel", image: "/demo/v6/c4-textiel.jpg", blurb: "Kleden, plaids en stoffen" },
  { key: "Koken", label: "Koken", image: "/demo/v6/c5-koken.jpg", blurb: "Servies en keukengerei" },
  { key: "Opbergen", label: "Opbergen", image: "/demo/v6/c6-opbergen.jpg", blurb: "Kasten, manden en opbergers" },
];

export type DemoPromo = { title: string; note: string; image: string; category: string };

export const DEMO_PROMOS: DemoPromo[] = [
  { title: "Ontdek de wooncollectie", note: "Meubels met karakter", image: "/demo/v6/m01.jpg", category: "Wonen" },
  { title: "Verlicht je interieur", note: "Vloer- en tafellampen", image: "/demo/v6/m02.jpg", category: "Verlichting" },
  { title: "Textiel voor elk seizoen", note: "Kleden en plaids", image: "/demo/v6/m03.jpg", category: "Textiel" },
  { title: "Zet je tuin klaar", note: "Buitenmeubels en potten", image: "/demo/v6/m04.jpg", category: "Tuin" },
  { title: "Buitenleven", note: "Aan tafel in de tuin", image: "/demo/v6/m05.jpg", category: "Tuin" },
  { title: "Koken met karakter", note: "Servies en pannen", image: "/demo/v6/m06.jpg", category: "Koken" },
  { title: "Slim opbergen", note: "Kasten en manden", image: "/demo/v6/m07.jpg", category: "Opbergen" },
  { title: "Warm hout", note: "Eiken en teak", image: "/demo/v6/m08.jpg", category: "Wonen" },
  { title: "Zachte tinten", note: "Natuurlijke kleuren", image: "/demo/v6/m09.jpg", category: "Textiel" },
  { title: "Groen in huis", note: "Planten en potten", image: "/demo/v6/m10.jpg", category: "Tuin" },
  { title: "Aan tafel", note: "Servies voor elk moment", image: "/demo/v6/m11.jpg", category: "Koken" },
  { title: "Kleine ruimtes", note: "Groot wonen op weinig m²", image: "/demo/v6/m12.jpg", category: "Opbergen" },
];

export function demoMedia(id: string): string | null {
  return DEMO_MEDIA[id] ?? null;
}
