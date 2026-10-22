import assert from "node:assert/strict";
import { test } from "node:test";
import { createHostBuyerNavigation } from "../../../apps/marketplace/src/lib/commercial/buyer-navigation";

test("host navigation owns push/replace and suppresses repeated same-location clicks", () => {
  let location = "/discover?country=BE";
  const calls: { href: string; replace: boolean }[] = [];
  const listeners = new Set<() => void>();
  let emissions = 0;
  const navigation = createHostBuyerNavigation({
    initialLocation: location,
    getLocation: () => location,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(href, { replace }) {
      calls.push({ href, replace });
      location = href;
      listeners.forEach((listener) => listener());
    },
  });
  const stop = navigation.subscribe(() => emissions++);
  navigation.navigate("/product/prd_001?country=BE");
  navigation.navigate("/product/prd_001?country=BE");
  navigation.navigate("/product/prd_001?country=BE&offer=demo-offer-1", true);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => call.replace),
    [false, true],
  );
  assert.equal(emissions, 2);
  assert.equal(navigation.getSnapshot(), location);
  assert.equal(navigation.getServerSnapshot(), "/discover?country=BE");
  stop();
  navigation.navigate("/cart");
  assert.equal(emissions, 2);
});
test("host back/forward updates are consumed without a second browser history writer", () => {
  let location = "/cart";
  let listener = () => {};
  const navigation = createHostBuyerNavigation({
    initialLocation: location,
    getLocation: () => location,
    subscribe(next) {
      listener = next;
      return () => {};
    },
    navigate() {
      throw new Error("No navigation command expected for host traversal");
    },
  });
  const seen: string[] = [];
  navigation.subscribe(() => seen.push(navigation.getSnapshot()));
  location = "/product/prd_001";
  listener();
  location = "/cart";
  listener();
  assert.deepEqual(seen, ["/product/prd_001", "/cart"]);
});
