/** Real synthetic-only native HTTP receiver. Not the proposed production WMS v1 contract. */
import { createHmac, randomUUID } from "node:crypto";

export function nativeReceiver({
  url,
  site,
  company,
  actor,
  signingKey,
  hosted = false,
  timeoutMs = 20000,
}) {
  const endpoint = new URL(url);
  if (
    !(hosted
      ? endpoint.protocol === "https:" &&
        endpoint.hostname.endsWith(".onrender.com") &&
        !endpoint.port
      : endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1") ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password ||
    !/^wms-native-[ab][.]invalid$/.test(site) ||
    !/^TEST-[AB]$/.test(company) ||
    site !== `wms-native-${company.slice(-1).toLowerCase()}.invalid` ||
    typeof actor !== "string" ||
    !/^[^@\s]+@example[.]invalid$/.test(actor) ||
    typeof signingKey !== "string" ||
    signingKey.length < 32
  )
    throw Error("Explicit company-matched synthetic native binding required");
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: actor,
        company_id: company,
        source: "lab-manual",
        jti: randomUUID(),
        iat: now,
        nbf: now - 1,
        exp: now + 120,
        iss: "surooh-synthetic-issuer",
        aud: "surooh-native-lab",
      }),
    ).toString("base64url");
    return (
      head +
      "." +
      body +
      "." +
      createHmac("sha256", signingKey)
        .update(head + "." + body)
        .digest("base64url")
    );
  };
  const call = async (method, body) => {
    const r = await fetch(
      new URL("/api/method/borvat_native_test.api." + method, endpoint),
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          "X-Frappe-Site-Name": site,
          "X-Surooh-Synthetic-JWT": token(),
        },
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) throw Error("Native HTTP " + r.status);
    const data = await r.json();
    if (!data.message || typeof data.message !== "object")
      throw Error("Malformed native reply");
    return data.message;
  };
  const envelope = (e) => {
    if (
      e.mode !== "test" ||
      e.company_id !== company ||
      e.source !== "borvat-test"
    )
      throw Error("Native binding mismatch");
    return {
      company,
      source: "lab-manual",
      request_id: e.command_id,
      operation: e.operation,
      payload: e.payload,
    };
  };
  const evidence = (e, result) => ({
    commandId: e.command_id,
    company,
    status: result.rejected ? "rejected" : "completed",
    references: Object.values(result).filter((x) => typeof x === "string"),
    native: result,
  });
  return {
    mode: "test",
    durableIdempotency: true,
    document: async (data) => call("document", { ...data, company }),
    inspect: async (sales_order) =>
      call("inspect_order", { company, sales_order }),
    availability: async () =>
      (await call("availability", { company })).available,
    lookup: async (e) => {
      const result = await call("lookup", { envelope: envelope(e) });
      return result.found
        ? { kind: "found", evidence: evidence(e, result.result) }
        : { kind: "absent", authoritative: true };
    },
    execute: async (e) =>
      evidence(e, await call("command", { envelope: envelope(e) })),
  };
}
