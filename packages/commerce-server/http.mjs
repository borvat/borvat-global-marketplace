import { CommerceError } from "./store.mjs";

export function createCommerceHandler({ store, origin }) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw Error("Explicit HTTPS or loopback origin required");
  const secure = url.protocol === "https:";
  const cookieName = secure ? "__Host-borvat-test" : "borvat-test";
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    vary: "Cookie",
  };
  const response = (body, status = 200, cookie) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...headers,
        ...(cookie
          ? {
              "set-cookie": `${cookieName}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookie === "deleted" ? 0 : 2592000}${secure ? "; Secure" : ""}`,
            }
          : {}),
      },
    });
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/commerce/")) return null;
    const token = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    try {
      // No CORS and no proxy/Host-derived authority. Even the loopback harness uses this exact origin.
      if (
        request.method !== "GET" &&
        (request.headers.get("origin") !== origin ||
          request.headers.get("content-type")?.split(";")[0] !==
            "application/json")
      )
        throw new CommerceError("ORIGIN_OR_CONTENT_TYPE_DENIED", 403);
      if (
        request.method === "GET" &&
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new CommerceError("CROSS_SITE_DENIED", 403);
      let body = {};
      if (request.method === "POST") {
        if (Number(request.headers.get("content-length")) > 16384)
          throw new CommerceError("BODY_TOO_LARGE", 413);
        const reader = request.body?.getReader();
        let length = 0,
          chunks = [];
        if (reader)
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 16384) {
              await reader.cancel();
              throw new CommerceError("BODY_TOO_LARGE", 413);
            }
            chunks.push(value);
          }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw Error();
        } catch {
          throw new CommerceError("INVALID_JSON");
        }
      }
      if (path === "/api/commerce/session" && request.method === "POST") {
        const current = store.identity(token);
        if (current) return response(current);
        const session = store.createSession();
        return response(session.principal, 201, session.token);
      }
      if (path === "/api/commerce/session" && request.method === "GET")
        return response(store.require(token));
      if (path === "/api/commerce/login" && request.method === "POST") {
        // Rate key combines the actual trusted transport peer (attached by the local Node server), never X-Forwarded-For.
        const session = store.login(
          body.email,
          body.password,
          token,
          "shared-origin",
        );
        return response(session.principal, 200, session.token);
      }
      if (path === "/api/commerce/logout" && request.method === "POST") {
        store.logout(token);
        return response({ loggedOut: true }, 200, "deleted");
      }
      if (path === "/api/commerce/catalog" && request.method === "GET") {
        const offers = store.catalog();
        const availability = {};
        for (const company of new Set(offers.map((o) => o.company))) {
          const receiver = store.receivers[company];
          if (!receiver) throw new CommerceError("WMS_NOT_CONNECTED", 503);
          availability[company] = await receiver.availability();
        }
        return response({
          offers: offers.map((o) => ({
            ...o,
            available: Math.floor(
              (availability[o.company][o.sku] ?? 0) / o.pack,
            ),
          })),
        });
      }
      if (path === "/api/commerce/quote" && request.method === "POST")
        return response(await store.quote(token, body), 201);
      if (path === "/api/commerce/orders" && request.method === "POST") {
        const saved = store.place(token, body);
        return response(await store.reserveOrder(token, saved.id), 201);
      }
      if (path === "/api/commerce/orders" && request.method === "GET")
        return response({ orders: store.list(token) });
      if (path === "/api/commerce/admin" && request.method === "GET")
        return response(store.admin(token));
      if (path === "/api/commerce/admin/sellers" && request.method === "POST")
        return response(store.approve(token, body.seller, body.state));
      if (path === "/api/commerce/admin/users" && request.method === "POST") {
        store.setUserEnabled(token, body.user, body.enabled);
        return response({ saved: true });
      }
      if (path === "/api/commerce/offers/price" && request.method === "POST")
        return response(
          store.setPrice(token, body.offerId, body.price, body.version),
        );
      const match = path.match(
        /^\/api\/commerce\/orders\/([A-Za-z0-9._:-]+)(?:\/(action|payment-simulator))?$/,
      );
      if (match && request.method === "GET" && !match[2])
        return response(store.order(token, match[1]));
      if (match && request.method === "POST" && match[2] === "action")
        return response(
          await store.executePortion(
            token,
            match[1],
            body.sellerId,
            body.action,
            body.payload,
            body.key,
          ),
        );
      if (
        match &&
        request.method === "POST" &&
        match[2] === "payment-simulator"
      )
        return response(store.simulatePayment(token, match[1], body));
      return response({ error: "NOT_FOUND" }, 404);
    } catch (e) {
      // No SQL, tokens, upstream tracebacks, passwords or PII in browser responses.
      return response(
        {
          error: e instanceof CommerceError ? e.message : "SERVICE_UNAVAILABLE",
        },
        e instanceof CommerceError ? e.status : 503,
      );
    }
  };
}
