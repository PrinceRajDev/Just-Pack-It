import { fail } from "../common/errors.js";
/** Compare persisted account IDs, never a client supplied role or shop owner. */
export function assertNotOwnShop(accountId: string, ownerId: string) {
  if (accountId === ownerId) fail(403, "OWN_SHOP_PURCHASE", "You cannot buy from your own shop.");
}
