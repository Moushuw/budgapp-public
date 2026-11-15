import { describe, expect, it } from "vitest";
import { hrefTransactionsDuJour } from "./liens";

describe("hrefTransactionsDuJour", () => {
  it("LI1 — la consultation du compte, ce seul jour", () => {
    const id = "clx0000000000000000099999";
    expect(hrefTransactionsDuJour(id, "2099-03-31")).toBe(`/transactions?du=2099-03-31&au=2099-03-31&compte=${id}`);
  });
});
