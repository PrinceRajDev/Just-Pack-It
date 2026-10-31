import {it,expect} from "vitest";
import {deploymentReadiness} from "../src/config/readiness.js";
const env={NODE_ENV:"development",MONGODB_URI:"mongodb://private-host/secret-database",CORS_ORIGINS:"http://localhost:8081",SESSION_PEPPER:"isolated-session-".repeat(4),CURSOR_SECRET:"isolated-cursor-".repeat(4)};
it("reports production-only configuration gaps without leaking environment values",()=>{
 const report=deploymentReadiness(env);expect(report.configurationReady).toBe(false);expect(report.checks.find(check=>check.code==="CURRENT_CONFIG")?.status).toBe("pass");expect(report.checks.find(check=>check.code==="PRODUCTION_CONFIG")?.message).toContain("CORS_ORIGINS");const text=JSON.stringify(report);for(const value of [env.MONGODB_URI,env.SESSION_PEPPER,env.CURSOR_SECRET])expect(text).not.toContain(value);
});
it("never claims launch verification even when production configuration validates",()=>{
 const report=deploymentReadiness({...env,NODE_ENV:"production",CORS_ORIGINS:"https://shop.example.com"});expect(report.configurationReady).toBe(true);expect(report.launchVerified).toBe(false);expect(report.checks.some(check=>check.status==="unverified")).toBe(true);
});
it("identifies test payment mode as unsuitable for real launch",()=>{
 const report=deploymentReadiness({...env,CORS_ORIGINS:"https://shop.example.com",RAZORPAY_ENABLED:"true",RAZORPAY_KEY_ID:"rzp_test_isolated",RAZORPAY_KEY_SECRET:"isolated-api-secret-for-tests",RAZORPAY_WEBHOOK_SECRET:"isolated-webhook-secret-for-tests"});expect(report.checks.find(check=>check.code==="PAYMENT_MODE")?.status).toBe("blocked");expect(JSON.stringify(report)).not.toContain("isolated-api-secret-for-tests");
});
