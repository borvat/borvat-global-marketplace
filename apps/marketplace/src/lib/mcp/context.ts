import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseAdmin } from "./supabase";

export type AppRole = "admin" | "seller" | "buyer";

/** Reads the current role from user_roles via service-role client (bypasses RLS on user_roles only). */
export async function getUserRole(ctx: ToolContext): Promise<AppRole | null> {
  if (!ctx.isAuthenticated()) return null;
  const admin = await supabaseAdmin();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.getUserId())
    .order("role", { ascending: true }); // admin < buyer < seller alphabetically; just take highest priority manually
  if (!data || data.length === 0) return null;
  const roles = data.map((r) => r.role as AppRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("seller")) return "seller";
  return "buyer";
}

export async function requireRole(ctx: ToolContext, ...allowed: AppRole[]): Promise<AppRole | null> {
  const role = await getUserRole(ctx);
  if (!role || !allowed.includes(role)) return null;
  return role;
}

/** Fire-and-forget audit log; never throws. */
export async function logAudit(
  ctx: ToolContext,
  toolName: string,
  status: "success" | "denied" | "error",
  opts: { role?: AppRole | null; input?: unknown; output?: unknown; error?: string } = {},
): Promise<void> {
  try {
    const admin = await supabaseAdmin();
    await admin.from("agent_audit_log").insert({
      user_id: ctx.isAuthenticated() ? ctx.getUserId() : null,
      role_at_time: opts.role ?? null,
      tool_name: toolName,
      client_id: ctx.getClientId?.() ?? null,
      input_summary: opts.input ? summarize(opts.input) : null,
      output_summary: opts.output ? summarize(opts.output) : null,
      status,
      error_message: opts.error ?? null,
    });
  } catch {
    // never let audit failures break tool calls
  }
}

// Keys matched case-insensitively as substrings so variants like
// "x-api-key", "client_secret_ciphertext", "set-cookie" all redact.
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "api_key",
  "apikey",
  "cookie",
  "set-cookie",
  "session",
  "ciphertext",
  "auth_tag",
  "authtag",
  "bearer",
  "jwt",
  "private_key",
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k === "iv") return true; // AES-GCM IV alongside ciphertext
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

function redactStringValue(s: string): string {
  // Bearer / Basic scheme.
  if (/^\s*(bearer|basic)\s+\S+/i.test(s)) return REDACTED;
  // JWT: three base64url segments separated by dots.
  if (/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(s)) return REDACTED;
  return s;
}

export function redactSensitive(input: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return redactStringValue(input);
  if (typeof input !== "object") return input;
  if (seen.has(input as object)) return "[Circular]";
  seen.add(input as object);
  if (Array.isArray(input)) return input.map((v) => redactSensitive(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactSensitive(v, seen);
  }
  return out;
}

export function summarize(v: unknown): unknown {
  const redacted = redactSensitive(v);
  const s = JSON.stringify(redacted);
  if (s === undefined) return null;
  if (s.length <= 2000) return redacted;
  return { truncated: true, preview: s.slice(0, 2000) };
}

/** Read a memory entry (owner-scoped). */
export async function readMemory(ctx: ToolContext, scope: string, key?: string) {
  if (!ctx.isAuthenticated()) return [];
  const admin = await supabaseAdmin();
  let q = admin
    .from("agent_memory")
    .select("*")
    .eq("owner_id", ctx.getUserId())
    .eq("scope", scope);
  if (key) q = q.eq("key", key);
  const { data } = await q;
  return data ?? [];
}

/** Upsert a memory entry (90-day default expiry). */
export async function writeMemory(
  ctx: ToolContext,
  scope: string,
  key: string,
  value: unknown,
  opts: { source: string; confidence?: number; ttlDays?: number; role?: AppRole } = { source: "tool" },
) {
  if (!ctx.isAuthenticated()) return;
  const admin = await supabaseAdmin();
  const ttl = opts.ttlDays ?? 90;
  const expires = new Date(Date.now() + ttl * 86400_000).toISOString();
  await admin.from("agent_memory").upsert(
    {
      owner_id: ctx.getUserId(),
      owner_role: opts.role ?? "buyer",
      scope,
      key,
      value: value as never,
      source: opts.source,
      confidence: opts.confidence ?? 0.5,
      expires_at: expires,
    },
    { onConflict: "owner_id,scope,key" },
  );
}
