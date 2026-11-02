import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  CONNECTED_TEST_COMMERCE,
  ISOLATED_COMMERCE,
  isolatedCommerceRequestStatus,
} from "./lib/commercial/runtime-mode";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Baseline security headers for every response the storefront serves. Values stay
// permissive on inline script/style because TanStack Start hydrates through inline
// tags; frame-ancestors and nosniff are the parts that actually matter here.
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response: Response): Response {
  // Mutate the headers in place. Re-building the Response from `response.body`
  // breaks the static-asset handler: assets answered 500 and nothing hydrated.
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

async function handle(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    if (CONNECTED_TEST_COMMERCE && new URL(request.url).pathname.startsWith("/api/commerce/")) {
      try {
        const { connectedTestHandler } =
          await import("../../../packages/commerce-server/runtime.mjs");
        return (await connectedTestHandler(request)) ?? new Response("Not found", { status: 404 });
      } catch {
        return Response.json({ error: "CONNECTED_TEST_UNAVAILABLE" }, { status: 503 });
      }
    }
    if (ISOLATED_COMMERCE) {
      const status = isolatedCommerceRequestStatus(request.method, new URL(request.url).pathname);
      if (status !== 200)
        return new Response(status === 405 ? "Method not allowed" : "Not found", {
          status,
          headers: status === 405 ? { Allow: "GET, HEAD" } : undefined,
        });
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return withSecurityHeaders(await handle(request, env, ctx));
  },
};
