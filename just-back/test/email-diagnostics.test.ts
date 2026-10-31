import { afterEach, expect, it, vi } from "vitest";
import { emailFailureCategory } from "../src/auth/email-diagnostics.js";
import { deliverEmailOtp, emailTestWindow } from "../src/auth/email-otp.js";
import { loadConfig } from "../src/config/env.js";
const config = loadConfig({ NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1/unused", CORS_ORIGINS: "http://localhost:8081", SESSION_PEPPER: "qa-session-".repeat(4), CURSOR_SECRET: "qa-cursor-".repeat(4), BREVO_API_KEY: "qa-provider-secret-".repeat(3), EMAIL_FROM: "sender@qa.invalid" });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("restricts temporary send bypass to the configured mailbox and short active window",()=>{
  const now=Date.parse("2026-11-01T00:00:00Z");
  const enabled={...config,EMAIL_OTP_TEST_RECIPIENT:"test@qa.invalid",EMAIL_OTP_TEST_UNTIL:new Date(now+3600000).toISOString()};
  expect(emailTestWindow("test@qa.invalid",enabled,now)).toBe(true);
  expect(emailTestWindow("other@qa.invalid",enabled,now)).toBe(false);
  expect(emailTestWindow("test@qa.invalid",enabled,now+3600000)).toBe(false);
  expect(emailTestWindow("test@qa.invalid",{...enabled,EMAIL_OTP_TEST_UNTIL:new Date(now+86400001).toISOString()},now)).toBe(false);
  expect(emailTestWindow("test@qa.invalid",config,now)).toBe(false);
});
it.each([[401,"authentication_or_ip_restriction"],[402,"credits_or_account_plan"],[403,"account_permission_or_activation"],[429,"provider_rate_limit"],[503,"provider_unavailable"]])("maps %s to fixed category", (status, category) => expect(emailFailureCategory(Number(status))).toBe(category));
it("never logs raw rejection bodies, email, key or OTP", async () => {
  const warn = vi.spyOn(console,"warn").mockImplementation(()=>{});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({ code:"invalid_parameter", message:`private@qa.invalid 123456 ${config.BREVO_API_KEY}` }),{status:400})));
  await expect(deliverEmailOtp("private@qa.invalid","123456",config)).rejects.toThrow("Email provider submission not confirmed");
  const log=JSON.stringify(warn.mock.calls);
  expect(log).toContain("sender_or_request_configuration");
  for(const secret of ["private@qa.invalid","123456",config.BREVO_API_KEY!]) expect(log).not.toContain(secret);
});
it("logs a fixed network category and performs no automatic retry", async () => {
  const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
  const fetcher=vi.fn(async()=>{throw new Error("sensitive provider transport details");});vi.stubGlobal("fetch",fetcher);
  await expect(deliverEmailOtp("private@qa.invalid","123456",config)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();expect(JSON.stringify(warn.mock.calls)).toContain("network_timeout_or_transport");expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive");
});
it("accepts only 201 with a message identifier",async()=>{
  const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({messageId:"qa-accepted"}),{status:201})));
  await deliverEmailOtp("private@qa.invalid","123456",config);expect(warn).not.toHaveBeenCalled();
});
