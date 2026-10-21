import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

function stripBearerFetch(supabaseKey: string): typeof fetch {
  const isOpaque = supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_");
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isOpaque && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/** Supabase client acting as the signed-in MCP user (RLS applies as that user). */
export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, publishable, {
    global: {
      fetch: stripBearerFetch(publishable),
      headers: { Authorization: `Bearer ${ctx.getToken()}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client for admin-only reads/writes (Bol credentials, cross-user metadata). */
export async function supabaseAdmin(): Promise<SupabaseClient> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  return admin;
}

export function ok(text: string, structured?: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structured !== undefined ? { structuredContent: structured as Record<string, unknown> } : {}),
  };
}

export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
