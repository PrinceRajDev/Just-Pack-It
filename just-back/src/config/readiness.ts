import {loadConfig} from "./env.js";
export function deploymentReadiness(env:NodeJS.ProcessEnv){
  const checks:{code:string;status:"pass"|"blocked"|"unverified";message:string}[]=[];
  try{loadConfig(env);checks.push({code:"CURRENT_CONFIG",status:"pass",message:"Current configuration validates."});}
  catch(error){checks.push({code:"CURRENT_CONFIG",status:"blocked",message:error instanceof Error ? error.message : "Configuration is invalid."});}
  try{loadConfig({...env,NODE_ENV:"production"});checks.push({code:"PRODUCTION_CONFIG",status:"pass",message:"Production configuration validation passes; deployment is not verified."});}
  catch(error){checks.push({code:"PRODUCTION_CONFIG",status:"blocked",message:error instanceof Error ? error.message : "Production configuration is invalid."});}
  if(env.RAZORPAY_ENABLED==="true"){
    checks.push({code:"PAYMENT_MODE",status:env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")&&env.RAZORPAY_LIVE_ENABLED==="true" ? "unverified" : "blocked",message:env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "Test-mode Razorpay cannot collect real launch payments. Do not switch to live until provider and operational checks pass." : "Live payment collection requires separately reviewed account activation, test capture/refund and webhook delivery."});
    checks.push({code:"PAYMENT_OPERATIONS",status:"unverified",message:"Verify public signed webhook delivery, capture/refund tests, recovery worker supervision, seller settlement and abandoned-order handling."});
  }
  checks.push({code:"DATABASE_OPERATIONS",status:"unverified",message:"Verify replica-set readiness, declared indexes, backups and a tested restore. This command never connects to MongoDB."});
  checks.push({code:"DEPLOYMENT",status:"unverified",message:"Verify public HTTPS frontend/API, frontend API URL, process supervision, logs, real shop approval and service-area/order policies."});
  return {configurationReady:!checks.some(check=>check.status==="blocked"),launchVerified:false,checks};
}
