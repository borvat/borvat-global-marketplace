import { describe, it, expect } from "bun:test";
import { readRecentBuyerOrders, buyerOrderStatus } from "../src/lib/buyer-account";

describe("recent buyer order privacy and limit", () => {
  it("filters on the supplied authenticated user_id, newest first, and requests exactly three", async () => {
    const calls: unknown[] = [];
    const client = {
      from(table: "orders") {
        calls.push(table);
        return { select(columns: "id,created_at,status,total_cents") {
          calls.push(columns);
          return { eq(column: "user_id", value: string) {
            calls.push([column, value]);
            return { order(column: "created_at", options: { ascending: false }) {
              calls.push([column, options]);
              return { limit(count: number) {
                calls.push(count);
                return Promise.resolve({ data: [], error: null });
              } };
            } };
          } };
        } };
      },
    };
    await readRecentBuyerOrders(client, "signed-in-buyer");
    expect(calls).toEqual(["orders", "id,created_at,status,total_cents", ["user_id", "signed-in-buyer"], ["created_at", { ascending: false }], 3]);
  });
  it("never starts a query without an authenticated identity", () => {
    let queried = false;
    const client = { from() { queried = true; throw new Error("must not query"); } };
    expect(() => readRecentBuyerOrders(client, " ")).toThrow("Een aangemeld account is vereist.");
    expect(queried).toBe(false);
  });
  it("does not claim an unrecognized order state is paid or delivered", () => {
    expect(buyerOrderStatus("unexpected")).toEqual({ label: "Status onbekend", tone: "neutral" });
    expect(buyerOrderStatus("pending").label).toBe("In afwachting");
  });
});