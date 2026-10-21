/**
 * Unit tests for audit-log secret redaction in summarize().
 * Run: bunx tsx scripts/redaction-tests.ts
 */
import { summarize, redactSensitive } from "../src/lib/mcp/context";

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

const SECRET = "super-sensitive-value-shouldnt-leak-1234567890";
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function containsSecret(v: unknown): boolean {
  const s = JSON.stringify(v) ?? "";
  return s.includes(SECRET) || s.includes(JWT);
}

// 1. Secret at the beginning of payload
{
  const payload = { access_token: SECRET, other: "ok" };
  const out = summarize(payload);
  check("access_token at top-level redacted", !containsSecret(out), JSON.stringify(out));
}

// 2. Nested object
{
  const payload = { user: { profile: { refresh_token: SECRET } }, misc: 1 };
  const out = summarize(payload);
  check("refresh_token nested redacted", !containsSecret(out));
}

// 3. Inside arrays
{
  const payload = { items: [{ api_key: SECRET }, { client_secret: SECRET }] };
  const out = summarize(payload);
  check("api_key/client_secret in arrays redacted", !containsSecret(out));
}

// 4. Authorization header (Bearer <jwt>)
{
  const payload = { headers: { Authorization: `Bearer ${JWT}` } };
  const out = summarize(payload);
  check("Authorization Bearer header redacted", !containsSecret(out));
}

// 5. Cookie / set-cookie
{
  const payload = { headers: { cookie: `sb-access-token=${JWT}`, "set-cookie": SECRET } };
  const out = summarize(payload);
  check("cookie / set-cookie redacted", !containsSecret(out));
}

// 6. Bol credential ciphertext, iv, auth tag
{
  const payload = {
    client_id_ciphertext: SECRET,
    client_secret_ciphertext: SECRET,
    iv: SECRET,
    auth_tag: SECRET,
  };
  const out = summarize(payload);
  check("bol ciphertext/iv/auth_tag redacted", !containsSecret(out));
}

// 7. Payload shorter than 2KB still redacted (no size-gated bypass)
{
  const payload = { password: SECRET };
  const s = JSON.stringify(payload);
  const out = summarize(payload);
  check(
    "short (<2KB) payload still redacted",
    s.length < 2000 && !containsSecret(out),
  );
}

// 8. Bare JWT string value redacted
{
  const payload = { token_from_provider: JWT };
  const out = summarize(payload);
  check("JWT string value redacted (key match)", !containsSecret(out));
}

// 9. Non-sensitive keys are preserved
{
  const payload = { title: "Hello", price_cents: 1000 };
  const out = summarize(payload) as Record<string, unknown>;
  check(
    "non-sensitive fields preserved",
    out.title === "Hello" && out.price_cents === 1000,
  );
}

// 10. Circular refs don't crash
{
  const a: Record<string, unknown> = { password: SECRET };
  a.self = a;
  const out = redactSensitive(a);
  check("circular refs handled and password redacted", !containsSecret(out));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
