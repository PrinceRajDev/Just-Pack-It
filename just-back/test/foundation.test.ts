import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { decodeCursor, encodeCursor } from "../src/common/cursor.js";
import { randomUUID } from "node:crypto";
const testEnv = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/unused_test",
  CORS_ORIGINS: "http://localhost:8081",
  SESSION_PEPPER: "isolated-session-test-".repeat(3),
  CURSOR_SECRET: "isolated-cursor-test-".repeat(3),
  LOG_LEVEL: "silent",
};
const config = loadConfig(testEnv);
describe("database-independent foundation", () => {
  it("keeps Razorpay opt-in, requires credentials and gates live keys separately",()=>{
    expect(loadConfig(testEnv).RAZORPAY_ENABLED).toBe(false);
    expect(loadConfig(testEnv).PAYMENT_RECOVERY_WORKER_ENABLED).toBe(false);
    expect(()=>loadConfig({...testEnv,PAYMENT_RECOVERY_WORKER_ENABLED:"true"})).toThrow(/PAYMENT_RECOVERY_WORKER_ENABLED/);
    expect(loadConfig(testEnv).RAZORPAY_REFUNDS_ENABLED).toBe(false);
    expect(()=>loadConfig({...testEnv,RAZORPAY_REFUNDS_ENABLED:"true"})).toThrow(/RAZORPAY_REFUNDS_ENABLED/);
    expect(()=>loadConfig({...testEnv,RAZORPAY_ENABLED:"true"})).toThrow(/RAZORPAY_ENABLED/);
    const credentials={RAZORPAY_KEY_ID:"rzp_test_isolated",RAZORPAY_KEY_SECRET:"isolated-secret-for-tests",RAZORPAY_WEBHOOK_SECRET:"isolated-separate-webhook-secret-for-tests"};
    expect(loadConfig({...testEnv,...credentials,RAZORPAY_ENABLED:"true"}).RAZORPAY_ENABLED).toBe(true);
    expect(()=>loadConfig({...testEnv,...credentials,RAZORPAY_KEY_ID:"rzp_live_isolated",RAZORPAY_ENABLED:"true"})).toThrow(/RAZORPAY_LIVE_ENABLED/);
  });
  it("keeps inventory cleanup opt-in and rejects ambiguous boolean strings",()=>{
    expect(loadConfig(testEnv).INVENTORY_EXPIRY_WORKER_ENABLED).toBe(false);
    expect(loadConfig(testEnv).ORDERS_COD_ENABLED).toBe(false);
    expect(()=>loadConfig({...testEnv,ORDERS_COD_ENABLED:"yes"})).toThrow();
    expect(loadConfig({...testEnv,INVENTORY_EXPIRY_WORKER_ENABLED:"true"}).INVENTORY_EXPIRY_WORKER_ENABLED).toBe(true);
    expect(()=>loadConfig({...testEnv,INVENTORY_EXPIRY_WORKER_ENABLED:"yes"})).toThrow();
  });
  it("disables unconfigured image storage and rejects partial credentials",()=>{
    expect(loadConfig(testEnv).CLOUDFLARE_IMAGES_API_TOKEN).toBeUndefined();
    expect(()=>loadConfig({...testEnv,CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)})).toThrow();
  });
  it("keeps liveness separate from disconnected readiness", async () => {
    const app = createApp(config);
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/health/ready")).status).toBe(503);
  });
  it("does not accept placeholder/equal secrets or insecure production origins", () => {
    expect(() =>
      loadConfig({
        ...testEnv,
        CORS_ORIGINS: "http://localhost:8081",
        SESSION_PEPPER: "replace-with-placeholder-that-is-long-enough",
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        ...testEnv,
        CORS_ORIGINS: "http://localhost:8081",
        CURSOR_SECRET: config.SESSION_PEPPER,
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        ...testEnv,
        CORS_ORIGINS: "http://localhost:8081",
        NODE_ENV: "production",
      }),
    ).toThrow();
  });
  it("requires signed, correctly scoped cursors", () => {
    const token = encodeCursor(
      { scope: "test", sort: "name", key: "test", id: randomUUID() },
      config.CURSOR_SECRET,
    );
    expect(decodeCursor(token, "test", "name", config.CURSOR_SECRET).key).toBe(
      "test",
    );
    expect(() =>
      decodeCursor(token, "other", "name", config.CURSOR_SECRET),
    ).toThrow();
    expect(() =>
      decodeCursor(token + "x", "test", "name", config.CURSOR_SECRET),
    ).toThrow();
  });
  it("returns structured 404 and body-size errors", async () => {
    const app = createApp(config);
    const missing = await request(app).get("/payments");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "NOT_FOUND" });
    expect(missing.body).not.toHaveProperty("stack");
    expect(
      (
        await request(app)
          .post("/auth/login")
          .send({ phone: "x".repeat(140000) })
      ).status,
    ).toBe(413);
  });
  it("marks authentication responses non-cacheable, including rejected requests",async()=>{
    const response=await request(createApp(config)).post("/auth/login").send({phone:"bad",password:"bad"});
    expect(response.status).toBe(400);expect(response.headers["cache-control"]).toBe("private, no-store");expect(response.body).not.toHaveProperty("stack");
    const privateResponse=await request(createApp(config)).get("/seller/shop");expect(privateResponse.status).toBe(401);expect(privateResponse.headers["cache-control"]).toBe("private, no-store");
  });
});
