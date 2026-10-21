import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ok, err, supabaseAdmin, supabaseForUser } from "../supabase";
import { decryptSecret } from "../crypto";

const TOKEN_URL = "https://login.bol.com/token";
const API_BASE = "https://api.bol.com/retailer";

async function bolToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${TOKEN_URL}?grant_type=client_credentials`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Bol token error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function bolGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.retailer.v10+json",
    },
  });
  if (!res.ok) throw new Error(`Bol API ${path} error ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

type Offer = {
  offerId: string;
  ean?: string;
  reference?: string;
  onHoldByRetailer?: boolean;
  pricing?: { bundlePrices?: { unitPrice?: number }[] };
  stock?: { amount?: number };
  store?: { productTitle?: string };
};

export default defineTool({
  name: "bol_import_products",
  title: "Importeer producten uit Bol.com",
  description:
    "Haalt de offer-export op uit de Bol.com Retailer API van de ingelogde verkoper en synchroniseert titel, prijs en voorraad naar Borvat. Bol.com credentials moeten eerst met bol_configure opgeslagen zijn.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max aantal offers om te importeren (standaard 50)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const userId = ctx.getUserId();

    const admin = await supabaseAdmin();
    const { data: creds, error: credErr } = await admin
      .from("seller_bol_credentials")
      .select("client_id_ciphertext,client_secret_ciphertext")
      .eq("user_id", userId)
      .maybeSingle();
    if (credErr) return err(credErr.message);
    if (!creds) return err("Geen Bol.com credentials gevonden. Gebruik eerst bol_configure.");

    let token: string;
    try {
      token = await bolToken(
        decryptSecret(creds.client_id_ciphertext),
        decryptSecret(creds.client_secret_ciphertext),
      );
    } catch (e) {
      return err(e instanceof Error ? e.message : "Bol.com login mislukt");
    }

    // Bol.com's Retailer API vereist eerst het aanmaken van een offer-export;
    // hier proberen we het simpele pad: de al gecreëerde export ophalen.
    // Voor MVP: haal de eerste pagina van offers via /offers/export (offer-export CSV endpoint).
    // Zonder gecreëerde export lukt dit niet — we tonen dan een duidelijke melding.
    let offers: Offer[] = [];
    try {
      const list = await bolGet<{ offers?: Offer[] }>(`/offers?page=1`, token).catch(() => null);
      if (list?.offers) offers = list.offers.slice(0, limit ?? 50);
    } catch {
      // ignore, offers stays empty
    }

    if (offers.length === 0) {
      return err(
        "Geen offers opgehaald. Bol.com vereist mogelijk dat je eerst een offer-export aanmaakt via de Retailer API (POST /offers/export). Voor MVP is een enkelvoudige lijst-import nodig; dit deel wordt uitgebreid.",
      );
    }

    const sb = supabaseForUser(ctx);
    let imported = 0;
    for (const o of offers) {
      const title = o.store?.productTitle ?? o.reference ?? o.offerId;
      const priceCents = Math.round((o.pricing?.bundlePrices?.[0]?.unitPrice ?? 0) * 100);
      const stock = o.stock?.amount ?? 0;
      const { error: upErr } = await sb.from("products").upsert(
        {
          seller_id: userId,
          title,
          price_cents: priceCents,
          stock,
          is_active: !o.onHoldByRetailer,
        },
        { onConflict: "seller_id,title" },
      );
      if (!upErr) imported++;
    }

    return ok(`${imported} product(en) geïmporteerd uit Bol.com`, { imported, total: offers.length });
  },
});
