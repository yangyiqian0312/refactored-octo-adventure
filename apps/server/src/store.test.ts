import { describe, expect, it } from "vitest";
import { InMemoryOrderStore } from "./store.js";

describe("InMemoryOrderStore dedupe", () => {
  it("remembers dedupe keys", () => {
    const store = new InMemoryOrderStore();

    expect(store.hasDedupeKey("order:123:paid")).toBe(false);
    store.rememberDedupeKey("order:123:paid");
    expect(store.hasDedupeKey("order:123:paid")).toBe(true);
  });
});
