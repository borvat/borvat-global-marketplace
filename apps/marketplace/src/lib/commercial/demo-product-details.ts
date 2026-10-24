/** Synthetic product copy for the isolated test shop. Not supplier data; replace via the catalog source. */
export type DemoProductDetails = { description: string; specs: [string, string][] };

const details: Record<string, DemoProductDetails> = {
  prd_001: {
    description:
      "Robuuste eettafel van massief eiken met een natuurlijk geoliede afwerking. Biedt ruimte aan zes tot acht personen.",
    specs: [
      ["Materiaal", "Massief eiken"],
      ["Afmetingen", "180 × 90 × 76 cm"],
      ["Zitplaatsen", "6–8"],
      ["Montage", "Poten zelf monteren"],
    ],
  },
  prd_002: {
    description:
      "Comfortabele driezitsbank met linnen bekleding en koudschuim zitting. Leverbaar in twee voorbeeldkleuren.",
    specs: [
      ["Bekleding", "Linnenmix"],
      ["Afmetingen", "214 × 92 × 84 cm"],
      ["Zithoogte", "45 cm"],
      ["Zitplaatsen", "3"],
    ],
  },
  prd_003: {
    description: "Ruime wandkast van massief grenen met verstelbare planken en twee deuren.",
    specs: [
      ["Materiaal", "Massief grenen"],
      ["Breedte", "200 cm"],
      ["Planken", "4, verstelbaar"],
    ],
  },
  prd_004: {
    description:
      "Elegante vloerlamp met messing voet en een zachte linnen kap voor sfeervol licht.",
    specs: [
      ["Materiaal", "Messing, linnen"],
      ["Hoogte", "160 cm"],
      ["Fitting", "E27"],
      ["Lamp inbegrepen", "Nee"],
    ],
  },
  prd_005: {
    description: "Handgeweven wollen vloerkleed in een warme zandtint.",
    specs: [
      ["Materiaal", "Wol"],
      ["Afmetingen", "200 × 300 cm"],
    ],
  },
  prd_006: {
    description: "Grote keramische plantenpot in off-white, geschikt voor binnen.",
    specs: [
      ["Materiaal", "Keramiek"],
      ["Diameter", "45 cm"],
      ["Hoogte", "42 cm"],
      ["Waterafvoer", "Ja"],
    ],
  },
  prd_007: {
    description:
      "Complete tuinset van teakhout met tafel en zes stoelen, bestand tegen alle weersomstandigheden.",
    specs: [
      ["Materiaal", "Teakhout"],
      ["Personen", "6"],
      ["Tafel", "200 × 100 cm"],
    ],
  },
  prd_008: {
    description: "Grote parasol met UV-werend doek en kantelfunctie. Voet niet inbegrepen.",
    specs: [
      ["Diameter", "300 cm"],
      ["Doek", "Polyester, UV 50+"],
      ["Kantelbaar", "Ja"],
    ],
  },
  prd_009: {
    description: "Stevige vuurkorf van gietijzer voor gezellige avonden in de tuin.",
    specs: [
      ["Materiaal", "Gietijzer"],
      ["Diameter", "60 cm"],
      ["Gewicht", "14 kg"],
    ],
  },
};

export function productDetails(productId: string): DemoProductDetails {
  return details[productId] ?? { description: "", specs: [] };
}
