import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
});

const assignments: Record<string, string> = {
  "Borvat Smart Hub Gen 2": "/images/products/smart-hub.jpg",
  "Borvat Robotstofzuiger V5": "/images/products/robot-vacuum.jpg",
  "Borvat Luchtreiniger PureAir": "/images/products/air-purifier.jpg",
  "Borvat Smartwatch FitPro": "/images/products/smartwatch.jpg",
  "Borvat Draadloze Oordjes AirBuds": "/images/products/earbuds.jpg",
  "Borvat Opvouwbare E-bike": "/images/products/e-bike.jpg",
  "Borvat Game Controller Pro": "/images/products/game-controller.jpg",
  "Borvat Projector Mini 1080p": "/images/products/projector.jpg",
};

async function main() {
  let updated = 0;
  for (const [title, image] of Object.entries(assignments)) {
    const { error } = await supabaseAdmin
      .from("products")
      .update({ image_url: image })
      .ilike("title", title);
    if (error) {
      console.error("Update failed", title, error.message);
    } else {
      updated++;
    }
  }
  console.log(`Updated ${updated} product images`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
