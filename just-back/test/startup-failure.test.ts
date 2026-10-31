import {it,expect} from "vitest";
import {startupFailure} from "../src/common/startup-failure.js";
it("explains nested TLS errors without printing driver messages or credentials",()=>{
  const error={name:"MongooseServerSelectionError",message:"mongodb://secret:password@private-host",reason:{servers:new Map([["private-host",{error:{cause:{code:"ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR"}}}]])}};
  expect(startupFailure(error)).toContain("TLS handshake rejected");expect(startupFailure(error)).not.toContain("password");expect(startupFailure(error)).not.toContain("private-host");
});
it("reports safe configuration field names and redacts unknown exceptions",()=>{
  expect(startupFailure(new Error("Invalid configuration fields: EMAIL_FROM"))).toContain("EMAIL_FROM");
  expect(startupFailure(new Error("secret contents"))).not.toContain("secret contents");
});
