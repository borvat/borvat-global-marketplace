/**
 * Seed buyer-facing catalog for Borvat storefront.
 * Uses the first admin profile as seller and maps products to categories.
 * This is demo data for the buyer storefront; real Bol products will be
 * imported once live credentials are verified.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
});

const categories = [
  { slug: "elektronica", name: "Elektronica" },
  { slug: "wonen", name: "Wonen & Koken" },
  { slug: "speelgoed", name: "Speelgoed" },
  { slug: "mode", name: "Mode" },
  { slug: "sport", name: "Sport & Vrije tijd" },
  { slug: "beauty", name: "Beauty & Verzorging" },
  { slug: "boeken", name: "Boeken" },
  { slug: "games", name: "Games & Films" },
];

const productCatalog: {
  title: string;
  description: string;
  category_slug: string;
  price_cents: number;
  original_price_cents: number;
  stock: number;
  rating: number;
  review_count: number;
}[] = [
  // Elektronica
  { title: "Borvat Smart Hub Gen 2", description: "Centrale smart home controller met Matter en Thread. Bedien verlichting, thermostaten en sensoren vanuit één app.", category_slug: "elektronica", price_cents: 12999, original_price_cents: 14999, stock: 45, rating: 4.7, review_count: 312 },
  { title: "Borvat WiFi Mesh Router (3-pack)", description: "Dekking tot 500 m², eenvoudige app-installatie en ouderlijk toezicht. Geschikt voor slimme woningen.", category_slug: "elektronica", price_cents: 19999, original_price_cents: 24999, stock: 30, rating: 4.6, review_count: 189 },
  { title: "Borvat Smart Deurbel Pro", description: "2K HDR-video, tweeweg-audio, nachtzicht en AI-detectie. Werkt met bestaande beldraad.", category_slug: "elektronica", price_cents: 14999, original_price_cents: 17999, stock: 22, rating: 4.5, review_count: 156 },
  { title: "Borvat Indoor Cam 360°", description: "Pan-tilt bewakingscamera met bewegingsdetectie, cloud-opslag en privacy-shutter.", category_slug: "elektronica", price_cents: 7999, original_price_cents: 9999, stock: 60, rating: 4.4, review_count: 98 },
  { title: "Borvat Smart Thermostaat", description: "Leert je schema en bespaart energie. Bedienbaar via app en stemassistenten.", category_slug: "elektronica", price_cents: 17999, original_price_cents: 21999, stock: 18, rating: 4.8, review_count: 421 },
  { title: "Borvat Draadloze Sneloplader 15W", description: "Minimalistisch oplaadstation voor smartphone en oortjes. Inclusief adapter.", category_slug: "elektronica", price_cents: 3499, original_price_cents: 4499, stock: 120, rating: 4.3, review_count: 67 },
  { title: "Borvat Smart Stekker 4-pack", description: "Bedien apparaten op afstand, meet energieverbruik en zet timers via de app.", category_slug: "elektronica", price_cents: 4999, original_price_cents: 5999, stock: 85, rating: 4.5, review_count: 234 },

  // Wonen & Koken
  { title: "Borvat Robotstofzuiger V5", description: "LiDAR-navigatie, dweilfunctie, no-go zones en zelfledigende dock. Geschikt voor huisdierhaar.", category_slug: "wonen", price_cents: 39999, original_price_cents: 49999, stock: 14, rating: 4.6, review_count: 267 },
  { title: "Borvat Luchtreiniger PureAir", description: "HEPA-13 filter, stille nachtmodus en real-time luchtkwaliteitsmonitor.", category_slug: "wonen", price_cents: 24999, original_price_cents: 29999, stock: 28, rating: 4.7, review_count: 145 },
  { title: "Borvat Slimme Waterkoker", description: "Temperatuurcontrole per graad, app-bediening en droogkookbeveiliging.", category_slug: "wonen", price_cents: 8999, original_price_cents: 10999, stock: 50, rating: 4.4, review_count: 89 },
  { title: "Borvat Sous-Vide Stick", description: "Precisiekoken tot op de graad. Waterdicht en eenvoudig schoon te maken.", category_slug: "wonen", price_cents: 11999, original_price_cents: 13999, stock: 33, rating: 4.8, review_count: 176 },
  { title: "Borvat Led-strip 5m RGBIC", description: "Individueel adresseerbare LEDs, muzieksync en schema's via app of stem.", category_slug: "wonen", price_cents: 3999, original_price_cents: 4999, stock: 95, rating: 4.5, review_count: 211 },
  { title: "Borvat Slimme Deurslot", description: "Keyless entry met app, code en NFC. Voldoet aan SKG** voor verzekeringskorting.", category_slug: "wonen", price_cents: 22999, original_price_cents: 27999, stock: 12, rating: 4.6, review_count: 98 },
  { title: "Borvat Slimme Rookmelder (2-pack)", description: "Netwerk gekoppeld, app-notificaties en 10-jarige batterij.", category_slug: "wonen", price_cents: 5999, original_price_cents: 7999, stock: 70, rating: 4.7, review_count: 334 },

  // Speelgoed
  { title: "Borvat Programmeerbare Robot Dinobot", description: "Leer kinderen coderen via blokjescode. Met sensoren, LED's en geluid.", category_slug: "speelgoed", price_cents: 6999, original_price_cents: 8999, stock: 40, rating: 4.8, review_count: 112 },
  { title: "Borvat STEM Bouwset 250-delig", description: "Techniek-set met tandwielen, motoren en sensors. Vanaf 8 jaar.", category_slug: "speelgoed", price_cents: 5499, original_price_cents: 6999, stock: 55, rating: 4.6, review_count: 78 },
  { title: "Borvat Slimme Knuffelbeer", description: "Interactieve beer met verhalen, slaapliedjes en ouderlijk toezicht via app.", category_slug: "speelgoed", price_cents: 3999, original_price_cents: 4999, stock: 90, rating: 4.4, review_count: 156 },
  { title: "Borvat RC Drone Mini", description: "Compacte drone met hoogtehoudfunctie, flip-knop en propellerbescherming.", category_slug: "speelgoed", price_cents: 5999, original_price_cents: 7999, stock: 38, rating: 4.3, review_count: 203 },

  // Mode
  { title: "Borvat Smartwatch FitPro", description: "AMOLED-scherm, GPS, hartslag-, SpO2- en slaapmonitoring. 14 dagen batterij.", category_slug: "mode", price_cents: 15999, original_price_cents: 19999, stock: 25, rating: 4.6, review_count: 388 },
  { title: "Borvat Draadloze Oordjes AirBuds", description: "Actieve ruisonderdrukking, transparantiemodus en 30 uur speeltijd met case.", category_slug: "mode", price_cents: 9999, original_price_cents: 12999, stock: 48, rating: 4.5, review_count: 512 },
  { title: "Borvat Smart Ring", description: "Volg slaap, activiteit en herstel in een minimalistische titanium ring.", category_slug: "mode", price_cents: 24999, original_price_cents: 29999, stock: 16, rating: 4.4, review_count: 67 },
  { title: "Borvat UV-Sensor Armband", description: "Meet zonnestraling en geeft advies over zonnebrand. Waterbestendig.", category_slug: "mode", price_cents: 2999, original_price_cents: 3999, stock: 110, rating: 4.2, review_count: 45 },

  // Sport & Vrije tijd
  { title: "Borvat Fitness Tracker Band", description: "Stappenteller, hartslag, 25 sportmodi en 5ATM waterdichtheid.", category_slug: "sport", price_cents: 4999, original_price_cents: 6999, stock: 75, rating: 4.5, review_count: 298 },
  { title: "Borvat Slimme Springtouw", description: "Telt sprongen, verbrande calorieën en synchroniseert met de app.", category_slug: "sport", price_cents: 2499, original_price_cents: 3499, stock: 130, rating: 4.3, review_count: 87 },
  { title: "Borvat Opvouwbare E-bike", description: "Elektrische vouwfiets met 50 km bereik, app-bediening en geïntegreerd slot.", category_slug: "sport", price_cents: 89999, original_price_cents: 109999, stock: 8, rating: 4.7, review_count: 54 },
  { title: "Borvat Draagbare Espressomaker", description: "Barista-koffie overal. Werkt op accu en heeft 20 bar druk.", category_slug: "sport", price_cents: 12999, original_price_cents: 15999, stock: 20, rating: 4.6, review_count: 134 },
  { title: "Borvat Smart Koelbox 20L", description: "Compressor-koelbox met app-temperatuurregeling, geschikt voor auto en camping.", category_slug: "sport", price_cents: 34999, original_price_cents: 39999, stock: 11, rating: 4.5, review_count: 76 },

  // Beauty & Verzorging
  { title: "Borvat Smart Tandenborstel", description: "Sonic reiniging met druksensor, app-coaching en opbergcase.", category_slug: "beauty", price_cents: 8999, original_price_cents: 11999, stock: 42, rating: 4.6, review_count: 223 },
  { title: "Borvat Huidanalyse Camera", description: "Analyseert huidvocht, rimpels en pigmentatie. Geeft persoonlijk advies.", category_slug: "beauty", price_cents: 14999, original_price_cents: 17999, stock: 15, rating: 4.2, review_count: 56 },
  { title: "Borvat IPL Ontharingsapparaat", description: "Langdurige haarreductie thuis. 5 energieniveaus en huidtoon-sensor.", category_slug: "beauty", price_cents: 19999, original_price_cents: 24999, stock: 19, rating: 4.5, review_count: 144 },
  { title: "Borvat Slimme Weegschaal", description: "Lichaamssamenstelling via bio-impedantie. Synchroniseert met gezondheidsapps.", category_slug: "beauty", price_cents: 4999, original_price_cents: 5999, stock: 65, rating: 4.4, review_count: 189 },

  // Boeken
  { title: "Smart Living Handboek — Borvat Editie", description: "De complete gids voor een verbonden, duurzaam en betaalbaar thuis.", category_slug: "boeken", price_cents: 2499, original_price_cents: 2999, stock: 200, rating: 4.8, review_count: 67 },
  { title: "Codeer je Eigen Robot — Voor kids", description: "Leer programmeren met leuke projecten voor kinderen van 8-12 jaar.", category_slug: "boeken", price_cents: 1999, original_price_cents: 2499, stock: 150, rating: 4.7, review_count: 43 },
  { title: "Duurzaam Thuis in 30 Dagen", description: "Praktische stappen om energie te besparen en je huis slimmer te maken.", category_slug: "boeken", price_cents: 1799, original_price_cents: 2299, stock: 180, rating: 4.5, review_count: 91 },

  // Games & Films
  { title: "Borvat Game Controller Pro", description: "Draadloze controller met hall-effect joysticks, geschikt voor PC en cloud gaming.", category_slug: "games", price_cents: 5999, original_price_cents: 7999, stock: 37, rating: 4.5, review_count: 167 },
  { title: "Borvat Streaming Stick 4K", description: "Android TV-stick met Dolby Vision, Wi-Fi 6 en spraafunctie.", category_slug: "games", price_cents: 6999, original_price_cents: 8999, stock: 58, rating: 4.6, review_count: 245 },
  { title: "Borvat Gaming Headset RGB", description: "7.1 surround, noise-cancelling microfoon en 20 uur batterij.", category_slug: "games", price_cents: 7999, original_price_cents: 9999, stock: 44, rating: 4.4, review_count: 198 },
  { title: "Borvat Projector Mini 1080p", description: "Compacte projector, 150 inch beeld, ingebouwde streaming-apps.", category_slug: "games", price_cents: 29999, original_price_cents: 34999, stock: 13, rating: 4.3, review_count: 88 },
];

async function main() {
  // Find the first admin/profile to use as seller
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (profileError || !profile) {
    console.error("No profile found to use as seller", profileError);
    process.exit(1);
  }
  const sellerId = profile.id;

  // Fetch category ids
  const { data: catRows, error: catError } = await supabaseAdmin
    .from("categories")
    .select("id, slug");
  if (catError || !catRows) {
    console.error("Failed to load categories", catError);
    process.exit(1);
  }
  const catMap = new Map(catRows.map((c) => [c.slug, c.id]));

  // Insert products
  let inserted = 0;
  for (const p of productCatalog) {
    const categoryId = catMap.get(p.category_slug);
    if (!categoryId) {
      console.warn("Unknown category", p.category_slug);
      continue;
    }
    const { error } = await supabaseAdmin.from("products").insert({
      seller_id: sellerId,
      category_id: categoryId,
      title: p.title,
      description: p.description,
      price_cents: p.price_cents,
      original_price_cents: p.original_price_cents,
      stock: p.stock,
      rating: p.rating,
      review_count: p.review_count,
      is_active: true,
      is_draft: false,
    });
    if (error) {
      console.error("Insert failed", p.title, error.message);
    } else {
      inserted++;
    }
  }
  console.log(`Seeded ${inserted} products`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
