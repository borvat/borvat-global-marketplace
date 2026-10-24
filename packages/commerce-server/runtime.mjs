/** Server-only bootstrap; never called by the public/demo profile. */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CommerceStore } from "./store.mjs";
import { nativeReceiver } from "./native-receiver.mjs";
import { createCommerceHandler } from "./http.mjs";
let handler;
export function connectedTestHandler(request) {
  if (!handler) {
    const dataDir = process.env.BORVAT_TEST_DATA_DIR,
      origin = process.env.BORVAT_TEST_ORIGIN,
      file = process.env.BORVAT_NATIVE_BINDINGS_FILE;
    if (!dataDir || !origin || !file)
      return new Response(
        JSON.stringify({ error: "CONNECTED_TEST_NOT_CONFIGURED" }),
        {
          status: 503,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      );
    if (statSync(file).mode & 0o077)
      throw Error("Native test binding must be private");
    const bindings = JSON.parse(readFileSync(file, "utf8"));
    const receivers = Object.fromEntries(
      Object.entries(bindings).map(([company, binding]) => [
        company,
        nativeReceiver(binding),
      ]),
    );
    const store = new CommerceStore({
      path: join(dataDir, "orders.sqlite"),
      receivers,
    });
    handler = createCommerceHandler({ store, origin });
  }
  return handler(request);
}
