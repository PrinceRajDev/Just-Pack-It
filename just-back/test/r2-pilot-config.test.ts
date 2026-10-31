import { expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { deploymentReadiness } from "../src/config/readiness.js";
import { uploadsEnabled } from "../src/images/service.js";
const env = { NODE_ENV: "production", MONGODB_URI: "mongodb://127.0.0.1/qa_only", CORS_ORIGINS: "https://just-pack-it.vercel.app", SESSION_PEPPER: "qa-session-".repeat(5), CURSOR_SECRET: "qa-cursor-".repeat(5), IMAGE_STORAGE_PROVIDER: "r2", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_R2_ACCESS_KEY_ID: "b".repeat(32), CLOUDFLARE_R2_SECRET_ACCESS_KEY: "qa-only-secret-".repeat(4), CLOUDFLARE_R2_BUCKET: "qa-bucket", CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://pub-qa.r2.dev" };
it("rejects production development URLs by default and explicit false", () => {
  expect(() => loadConfig(env)).toThrow();
  expect(() => loadConfig({ ...env, R2_ALLOW_DEV_PUBLIC_URL: "false" })).toThrow();
});
it("allows explicit pilot mode and keeps uploads configured", () => {
  const config = loadConfig({ ...env, R2_ALLOW_DEV_PUBLIC_URL: "true" });
  expect(config.R2_ALLOW_DEV_PUBLIC_URL).toBe(true);
  expect(uploadsEnabled(config)).toBe(true);
  const report = deploymentReadiness({ ...env, R2_ALLOW_DEV_PUBLIC_URL: "true" });
  expect(report.checks.find(check => check.code === "R2_PILOT_DELIVERY")?.status).toBe("unverified");
  expect(report.launchVerified).toBe(false);
  expect(JSON.stringify(report)).not.toContain(env.CLOUDFLARE_R2_SECRET_ACCESS_KEY);
});
it.each(["http://pub-qa.r2.dev", "https://account.r2.cloudflarestorage.com", "https://user:pass@pub-qa.r2.dev", "https://pub-qa.r2.dev?key=test"])("still rejects invalid delivery URL %s", url => {
  expect(() => loadConfig({ ...env, R2_ALLOW_DEV_PUBLIC_URL: "true", CLOUDFLARE_R2_PUBLIC_BASE_URL: url })).toThrow();
});
it("still requires complete keys and exact boolean flag", () => {
  expect(() => loadConfig({ ...env, R2_ALLOW_DEV_PUBLIC_URL: "true", CLOUDFLARE_R2_BUCKET: undefined })).toThrow();
  expect(() => loadConfig({ ...env, R2_ALLOW_DEV_PUBLIC_URL: "yes" })).toThrow();
});
it("allows a custom domain without opting into pilot mode", () => {
  expect(loadConfig({ ...env, CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://images.example.com" }).R2_ALLOW_DEV_PUBLIC_URL).toBe(false);
});
