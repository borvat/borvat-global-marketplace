import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ok, err } from "../supabase";
import { supabaseAdmin } from "../supabase";

export default defineTool({
  name: "forget_memory",
  title: "Vergeet opgeslagen voorkeur",
  description: "Verwijdert opgeslagen agent-geheugen voor de ingelogde gebruiker binnen een scope, optioneel een specifieke key.",
  inputSchema: {
    scope: z.string().min(1),
    key: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ scope, key }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Niet ingelogd");
    const admin = await supabaseAdmin();
    let q = admin.from("agent_memory").delete().eq("owner_id", ctx.getUserId()).eq("scope", scope);
    if (key) q = q.eq("key", key);
    const { error, data } = await q.select("id");
    if (error) return err(error.message);
    return ok(`${data?.length ?? 0} geheugen-item(s) verwijderd`);
  },
});
