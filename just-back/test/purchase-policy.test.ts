import { describe, expect, it } from "vitest";
import { assertNotOwnShop } from "../src/catalogue/purchase-policy.js";
describe("shop purchase ownership policy", () => {
  it("rejects the persisted shop owner regardless of the caller role", () => {
    expect(() => assertNotOwnShop("owner-account", "owner-account")).toThrow("You cannot buy from your own shop.");
    try { assertNotOwnShop("owner-account", "owner-account"); } catch (error) { expect(error).toMatchObject({status:403,code:"OWN_SHOP_PURCHASE"}); }
  });
  it("allows a different account through this ownership check", () => {
    expect(() => assertNotOwnShop("other-account", "owner-account")).not.toThrow();
  });
});
