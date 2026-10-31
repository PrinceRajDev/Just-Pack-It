import { User, Session, Throttle } from "../auth/models.js";
import { Category, Area, Shop, Product } from "../catalogue/models.js";
export const models = [User, Session, Throttle, Category, Area, Shop, Product];
export async function verifyCriticalIndexes() {
  for (const [model, fields] of [
    [User, ["phone"]],
    [Category, ["slug"]],
    [Shop, ["slug", "ownerId"]],
  ] as const) {
    const indexes = await model.collection.indexes();
    for (const field of fields)
      if (!indexes.some((i) => i.unique && i.key[field] === 1))
        throw new Error("Required unique index missing");
  }
  for (const model of [Session, Throttle]) {
    const indexes = await model.collection.indexes();
    if (
      !indexes.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)
    )
      throw new Error("Required TTL index missing");
  }
}
