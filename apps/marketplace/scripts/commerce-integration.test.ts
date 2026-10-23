import { test } from "node:test";
import assert from "node:assert/strict";
import { isolatedCommerceRequestStatus } from "../src/lib/commercial/runtime-mode";
import { readRecentBuyerOrders } from "../src/lib/buyer-account";
import { createRootRoute, createRouter, createMemoryHistory } from "@tanstack/react-router";
import { createTanStackBuyerNavigation } from "../src/lib/commercial/tanstack-navigation";

test("real router adapter rejects protocol, authority and browser-normalized authority escapes", () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/discover"] }),
  });
  const navigation = createTanStackBuyerNavigation(router);
  for (const href of [
    "https://example.test",
    "//example.test",
    "/\\example.test",
    "/\n/example.test",
    "javascript:alert(1)",
  ])
    assert.throws(() => navigation.navigate(href), /Only local/);
  assert.equal(router.history.location.href, "/discover");
});

test("isolated document surface permits buyer paths and rejects operational/API routes", () => {
  for (const path of ["/", "/discover", "/product/prd_001", "/cart", "/requests", "/workbench"])
    for (const method of ["GET", "HEAD"])
      assert.equal(isolatedCommerceRequestStatus(method, path), 200);
  for (const path of [
    "/account",
    "/checkout",
    "/seller/orders",
    "/admin/users",
    "/.mcp/list-tools",
    "/unknown",
  ])
    assert.equal(isolatedCommerceRequestStatus("GET", path), 404);
});

test("isolated server never dispatches write methods, including email and server functions", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    for (const path of ["/discover", "/lovable/email/auth/webhook", "/_serverFn/test"])
      assert.equal(isolatedCommerceRequestStatus(method, path), 405);
});

test("narrow buyer reader preserves verified identity, limit and original result", async () => {
  const rows = {
    data: [
      {
        id: "synthetic-order",
        created_at: "2026-10-23T00:00:00Z",
        status: "pending",
        total_cents: 100,
      },
    ],
    error: null,
  };
  let calls = 0;
  const result = await readRecentBuyerOrders((id, limit) => {
    calls++;
    assert.equal(id, "verified-buyer");
    assert.equal(limit, 3);
    return Promise.resolve(rows);
  }, "verified-buyer");
  assert.equal(result, rows);
  assert.equal(calls, 1);
  assert.throws(() =>
    readRecentBuyerOrders(() => {
      throw Error("must not query");
    }, " "),
  );
});
