import { beforeAll, afterAll, it, expect } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import { createUser, login } from "../src/auth/service.js";
import { User, Session } from "../src/auth/models.js";
import { Shop, Category, Area } from "../src/catalogue/models.js";
import { Audit } from "../src/admin/audit.js";
import { isOpen, scheduleLabel } from "../src/catalogue/presenters.js";
const config = loadConfig({ NODE_ENV: "test", EMAIL_OTP_REQUIRED: "false", MONGODB_URI: "mongodb://127.0.0.1:27017/unused", CORS_ORIGINS: "http://localhost:8081", SESSION_PEPPER: "availability-qa-session-".repeat(4), CURSOR_SECRET: "availability-qa-cursor-".repeat(4), LOG_LEVEL: "silent" });
const api = request(createApp(config)), password = "QA-availability-only-99383";
let repl: MongoMemoryReplSet, token: string, buyerToken: string, otherToken: string, shopId: string;
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ binary: { downloadDir: resolve(".cache/mongodb") }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  await connectDatabase(repl.getUri("qa_availability"));
  await Promise.all([User.init(), Session.init(), Shop.init(), Category.init(), Area.init()]);
  const seller = await createUser({ name: "QA Seller", phone: "+919003000001", password }, "seller");
  const buyer = await createUser({ name: "QA Buyer", phone: "+919003000002", password }, "buyer");
  const other = await createUser({ name: "QA Other", phone: "+919003000003", password }, "seller");
  token = (await login({ phone: seller.phone, password }, config, "qa")).token;
  buyerToken = (await login({ phone: buyer.phone, password }, config, "qa")).token;
  otherToken = (await login({ phone: other.phone, password }, config, "qa")).token;
  const category = await Category.create({ slug: "qa-food", name: "QA Food" });
  const area = await Area.create({ name: "QA Area", city: "QA City", pincodes: ["000000"] });
  const shop = await Shop.create({ ownerId: seller._id, slug: "qa-counter", name: "QA Counter", sortName: "qa counter", locality: "QA", categoryIds: [category._id], areaIds: [area._id], status: "approved", active: true, since: 2026, initials: "QA", fulfilment: ["pickup", "seller_delivery"], deliveryFeeCents: 2000, timezone: "Asia/Kolkata", openingHours: Array.from({ length: 7 }, (_, day) => ({ day, opens: "00:00", closes: "23:59" })) });
  shopId = shop._id;
});
afterAll(async () => { await disconnectDatabase(); await repl?.stop(); });
it("enforces authentication, seller role and own-shop resolution", async () => {
  expect((await api.patch("/seller/shop/availability").send({ version: 0, temporarilyClosed: true })).status).toBe(401);
  expect((await api.patch("/seller/shop/availability").auth(buyerToken, { type: "bearer" }).send({ version: 0, temporarilyClosed: true })).status).toBe(403);
  expect((await api.patch("/seller/shop/availability").auth(otherToken, { type: "bearer" }).send({ version: 0, temporarilyClosed: true })).status).toBe(404);
});
it("pauses without resetting approval; buyer DTO/open filter agree", async () => {
  const saved = await api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version: 0, temporarilyClosed: true });
  expect(saved.status).toBe(200); expect(saved.body.status).toBe("approved"); expect(saved.body.isOpen).toBe(false);
  const publicShop = await api.get("/shops/qa-counter");
  expect(publicShop.body.availability).toBe("temporarily_closed"); expect(publicShop.body.isOpen).toBe(false);
  const filtered = await api.get("/shops?openOnly=true"); expect(filtered.body.some((s: {id:string}) => s.id === shopId)).toBe(false);
  expect(await Audit.countDocuments({ action: "shop.availability.update", targetId: shopId })).toBe(1);
});
it("rejects stale updates and privilege/owner/identity injection", async () => {
  expect((await api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version: 0, temporarilyClosed: false })).status).toBe(409);
  for (const field of ["status", "active", "ownerId", "name", "shopId"]) expect((await api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version: 1, [field]: "tampered" })).status).toBe(400);
});
it("updates fulfilment and fees, and validates empty/equal-time settings", async () => {
  for (const input of [{ fulfilment: [] }, { openingHours: [{ day: 1, opens: "09:00", closes: "09:00" }] }, { deliveryFee: -1 }]) expect((await api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version: 1, ...input })).status).toBe(400);
  const saved = await api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version: 1, temporarilyClosed: false, fulfilment: ["pickup"], deliveryFee: 0 });
  expect(saved.status).toBe(200); expect(saved.body.status).toBe("approved");
  const dto = (await api.get("/shops/qa-counter")).body;
  expect(dto.fulfilment).toEqual(["pickup"]); expect(dto.deliveryFee).toBe(0); expect(dto.scheduleLabel).toContain("Asia/Kolkata");
});
it("unpausing never approves a suspended shop", async () => {
  await Shop.updateOne({ _id: shopId }, { $set: { status: "suspended" } });
  const saved = await api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version: 2, temporarilyClosed: false });
  expect(saved.body.status).toBe("suspended"); expect(saved.body.isOpen).toBe(false);
  expect((await api.get("/shops/qa-counter")).status).toBe(404);
});
it("respects overnight hours, closing boundaries and timezone", async () => {
  const shop = (await Shop.findById(shopId))!;
  shop.status = "approved"; shop.openingHours = [{ day: 6, opens: "22:00", closes: "02:00" }];
  expect(isOpen(shop, new Date("2026-10-31T19:30:00Z"))).toBe(true);
  expect(scheduleLabel(shop, new Date("2026-10-31T19:30:00Z"))).toContain("Overnight until 02:00");
  expect(isOpen(shop, new Date("2026-10-31T20:30:00Z"))).toBe(false);
  shop.temporarilyClosed = true; expect(isOpen(shop, new Date("2026-10-31T19:30:00Z"))).toBe(false);
});
it("allows one writer per version under concurrent availability saves", async () => {
  const version = (await Shop.findById(shopId))!.version;
  const update = () => api.patch("/seller/shop/availability").auth(token, { type: "bearer" }).send({ version, temporarilyClosed: true });
  const results = await Promise.all([update(), update()]);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
});
