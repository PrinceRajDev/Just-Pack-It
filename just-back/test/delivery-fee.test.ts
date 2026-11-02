import {expect,it} from "vitest";
import {deliveryFeeCents} from "../src/common/delivery-fee.js";
it("fixes rider fees independently of seller fees",()=>{expect(deliveryFeeCents("platform_delivery",9900)).toBe(3000);expect(deliveryFeeCents("platform_delivery")).toBe(3000);expect(deliveryFeeCents("seller_delivery",4500)).toBe(4500);expect(deliveryFeeCents("seller_delivery")).toBeUndefined();expect(deliveryFeeCents("pickup",4500)).toBe(0);});
