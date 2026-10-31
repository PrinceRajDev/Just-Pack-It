import { shopPatch } from "./validators.js";
import { ownedShop, transaction, cents } from "./service.js";
import type { Actor } from "../auth/middleware.js";
import { fail } from "../common/errors.js";
import { audit } from "../admin/audit.js";

export const availabilityInput = shopPatch.pick({ version: true, temporarilyClosed: true, openingHours: true, timezone: true, fulfilment: true, deliveryFee: true, minimumOrderAmount: true, pickupNote: true }).refine(v => Object.keys(v).length > 1, "Supply availability settings");
export async function updateAvailability(who: Actor, input: ReturnType<typeof availabilityInput.parse>) {
  return transaction(async session => {
    const shop = await ownedShop(who, session);
    if (shop.version !== input.version) fail(409, "VERSION_CONFLICT", "Shop changed; reload before saving availability");
    const { version: _version, deliveryFee, minimumOrderAmount, ...fields } = input;
    shop.set(fields);
    if (deliveryFee !== undefined) shop.deliveryFeeCents = cents(deliveryFee);
    if (minimumOrderAmount !== undefined) shop.minimumOrderCents = cents(minimumOrderAmount);
    // This transaction writes the same shop document as inventory/order validation.
    // It cannot approve/reactivate a shop or change identity/category/ownership.
    const saved = await shop.save({ session });
    await audit(who, "shop.availability.update", shop._id, session, shop.version);
    return saved;
  });
}
