import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { productDraftRoutes } from "../src/ai/product-draft.js";
import { requireRole } from "../src/auth/middleware.js";
import { ownedShop } from "../src/catalogue/service.js";
import { throttle } from "../src/auth/service.js";
import { AppError, errorHandler } from "../src/common/errors.js";
import type { Config } from "../src/config/env.js";
vi.mock("../src/catalogue/service.js", () => ({ ownedShop: vi.fn() }));
vi.mock("../src/auth/service.js", () => ({ throttle: vi.fn() }));
const config = { GEMINI_API_KEY: "test-only-key", GEMINI_MODEL: "gemini-flash-lite-latest" } as Config;
function app(role?: "buyer" | "seller", key = true) {
  const app = express();
  app.use((req, _res, next) => { if (role) req.actor = { id: "seller", role }; next(); });
  app.use(requireRole("seller"), productDraftRoutes({ ...config, GEMINI_API_KEY: key ? config.GEMINI_API_KEY : undefined }));
  app.use(errorHandler); return app;
}
beforeEach(() => vi.resetAllMocks());
it("requires authentication and seller role", async () => {
  expect((await request(app()).post("/product-draft")).status).toBe(401);
  expect((await request(app("buyer")).post("/product-draft")).status).toBe(403);
  expect(ownedShop).not.toHaveBeenCalled();
});
it("fails closed without configuration", async () => {
  expect((await request(app("seller", false)).post("/product-draft")).status).toBe(503);
});
it("requires the caller's owned shop", async () => {
  vi.mocked(ownedShop).mockRejectedValue(new AppError(404, "SHOP_NOT_FOUND", "Shop not found"));
  expect((await request(app("seller")).post("/product-draft")).status).toBe(404);
  expect(ownedShop).toHaveBeenCalledWith({ id: "seller", role: "seller" });
});
it("rejects unsupported media before provider requests", async () => {
  vi.mocked(ownedShop).mockResolvedValue({ active: true } as Awaited<ReturnType<typeof ownedShop>>);
  expect((await request(app("seller")).post("/product-draft").type("text/plain").send("x")).status).toBe(415);
});
it("enforces the database-backed seller throttle", async () => {
  vi.mocked(ownedShop).mockResolvedValue({ active: true } as Awaited<ReturnType<typeof ownedShop>>);
  vi.mocked(throttle).mockRejectedValue(new AppError(429, "RATE_LIMITED", "Too many attempts"));
  expect((await request(app("seller")).post("/product-draft").type("image/png").send(Buffer.from("x"))).status).toBe(429);
});
