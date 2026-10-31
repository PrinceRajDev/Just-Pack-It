import type { Request, RequestHandler } from "express";
import type { Config } from "../config/env.js";
import { Session, User, type Role } from "./models.js";
import { tokenHash } from "./service.js";
import { fail } from "../common/errors.js";
export interface Actor {
  id: string;
  role: Role;
}
declare module "express-serve-static-core" {
  interface Request {
    actor?: Actor;
  }
}
export const actor = (req: Request): Actor =>
  req.actor ?? fail(401, "AUTH_REQUIRED", "Authentication required");
export function authenticate(config: Config): RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control","private, no-store");
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9_-]{43})$/,
    )?.[1];
    if (!token) fail(401, "AUTH_REQUIRED", "Authentication required");
    const session = await Session.findOne({
      _id: tokenHash(token, config),
      expiresAt: { $gt: new Date() },
    });
    const user = session
      ? await User.findOne({ _id: session.userId, active: true })
      : null;
    if (!user || (session?.authVersion ?? 0)!==(user.authVersion ?? 0)) fail(401, "INVALID_SESSION", "Session expired or revoked");
    req.actor = { id: user._id, role: user.role };
    next();
  };
}
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!allowed.includes(actor(req).role))
      fail(403, "FORBIDDEN", "This action is not allowed");
    next();
  };
}
