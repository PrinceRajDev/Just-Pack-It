import { describe, expect, it } from "vitest";
import { deliveryFeeFor } from "@/lib/pricing";

describe("delivery fee estimate", () => {
  it("charges ₹25 for rider delivery under ₹299", () => {
    expect(deliveryFeeFor("platform_delivery", 298)).toBe(30);
  });
  it("is free for rider delivery at ₹299 or more", () => {
    expect(deliveryFeeFor("platform_delivery", 299)).toBe(30);
  });
  it("is free for shop delivery", () => {
    expect(deliveryFeeFor("seller_delivery", 50)).toBe(0);
  });
});
