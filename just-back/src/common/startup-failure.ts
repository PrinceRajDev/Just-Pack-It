/** Only fixed diagnostic copy may leave this boundary; never print raw driver errors. */
export function startupFailure(error:unknown):string{
  if(error instanceof Error && /^Invalid configuration fields: [A-Za-z0-9_., ]+$/.test(error.message))return `Startup failed. ${error.message}. Check backend .env; no values logged.`;
  if(error && typeof error==="object"){
    const value=error as {name?:string;code?:unknown;reason?:{servers?:Map<unknown,{error?:{code?:unknown;cause?:{code?:unknown}}}>}};
    const codes:Array<unknown>=[value.code];
    if(value.reason?.servers instanceof Map)for(const server of value.reason.servers.values())codes.push(server.error?.code,server.error?.cause?.code);
    if(codes.some(code=>typeof code==="string" && /TLS|SSL|CERT/.test(code)))return "Startup failed: MongoDB TLS handshake rejected. Check Atlas cluster status and Network Access for your current public IP; also check VPN/proxy/TLS inspection. TLS verification remains enabled. No secrets logged.";
    if(value.code===18)return "Startup failed: MongoDB authentication rejected. Check database user credentials and permissions in backend .env. No secrets logged.";
    if(value.name==="MongooseServerSelectionError")return "Startup failed: MongoDB cluster unreachable or no primary available. Check Atlas cluster status, current IP allowlist, DNS and network access. No secrets logged.";
  }
  return "Startup failed. Verify environment, required indexes and replica-set database availability. No secrets logged.";
}
