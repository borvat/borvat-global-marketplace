/** Server-only bootstrap; never called by the public/demo profile. */
import { join } from "node:path";
import { readTestConfig } from "./deployment-config.mjs";
import { CommerceStore } from "./store.mjs";
import { nativeReceiver } from "./native-receiver.mjs";
import { createCommerceHandler } from "./http.mjs";
let handler;
export function connectedTestHandler(request) {
  if (!handler) {
    if (
      !process.env.BORVAT_TEST_DATA_DIR ||
      !process.env.BORVAT_TEST_ORIGIN ||
      !process.env.BORVAT_NATIVE_BINDINGS_FILE
    )
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
    const { dataDir, origin, bindings, hosted } = readTestConfig();
    const receivers = Object.fromEntries(
      Object.entries(bindings).map(([company, binding]) => [
        company,
        nativeReceiver({ ...binding, hosted }),
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
