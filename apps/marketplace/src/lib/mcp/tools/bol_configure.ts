import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ok, err, supabaseAdmin } from "../supabase";
import { encryptSecret } from "../crypto";

export default defineTool({
  name: "bol_configure",
  title: "Bol.com API-credentials opslaan",
  description:
    "Slaat de Bol.com Retailer API client_id en client_secret van de ingelogde verkoper versleuteld op. Nodig voor bol_import_products. Credentials aanvragen: partnerplatform.bol.com → Instellingen → API.",
  inputSchema: {
    client_id: z.string().min(1).describe("Bol.com API client_id."),
    client_secret: z.string().min(1).describe("Bol.com API client_secret."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const admin = await supabaseAdmin();
    const { error } = await admin.from("seller_bol_credentials").upsert({
      user_id: ctx.getUserId(),
      client_id_ciphertext: encryptSecret(input.client_id),
      client_secret_ciphertext: encryptSecret(input.client_secret),
      updated_at: new Date().toISOString(),
    });
    if (error) return err(error.message);
    return ok("Bol.com credentials versleuteld opgeslagen.");
  },
});
