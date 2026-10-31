import { Router } from "express";
import { createHash } from "node:crypto";
import type { Config } from "../config/env.js";
import { User, type UserRecord } from "./models.js";
import { registerInput } from "./validators.js";
import { actor } from "./middleware.js";
import { createUser, throttle } from "./service.js";
import { privateListQuery } from "../catalogue/validators.js";
import { decodeCursor, encodeCursor } from "../common/cursor.js";
import { fail } from "../common/errors.js";
const summary = (user: Pick<UserRecord, "_id" | "name" | "phone" | "active">) => ({id: user._id, name: user.name, phone: user.phone, role: "seller" as const, active: user.active});
/** Mounted only behind database-backed authenticate + requireRole("admin"). */
export function adminSellerRoutes(config: Config) {
  const router = Router();
  router.post("/sellers", async (req, res) => {
    const input = registerInput.parse(req.body);
    await throttle(`admin-seller-create:${actor(req).id}`, config, 20);
    if (await User.exists({phone: input.phone})) fail(409, "DUPLICATE", "An account already uses this phone number");
    const user = await createUser(input, "seller");
    res.status(201).json(summary(user));
  });
  router.get("/sellers", async (req, res) => {
    const {limit, cursor} = privateListQuery.parse(req.query);
    const scope = createHash("sha256").update(JSON.stringify({kind:"admin-sellers", actorId:actor(req).id, limit})).digest("hex");
    const after = cursor ? decodeCursor(cursor,scope,"id",config.CURSOR_SECRET).id : undefined;
    const [rows, total] = await Promise.all([
      User.find({role:"seller", ...(after ? {_id:{$gt:after}} : {})}).select("_id name phone active").sort({_id:1}).limit(limit+1).maxTimeMS(5000).lean(),
      User.countDocuments({role:"seller"}).maxTimeMS(5000),
    ]);
    const more = rows.length > limit;
    if (more) rows.pop();
    res.setHeader("X-Total-Count",String(total));
    res.setHeader("X-Has-More",String(more));
    const last = rows.at(-1);
    if (more && last) res.setHeader("X-Next-Cursor",encodeCursor({scope,sort:"id",id:last._id,key:last._id},config.CURSOR_SECRET));
    res.json(rows.map(summary));
  });
  return router;
}
