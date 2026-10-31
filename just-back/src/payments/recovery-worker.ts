import "dotenv/config";
import pino from "pino";
import {loadConfig} from "../config/env.js";
import {connectDatabase,disconnectDatabase} from "../db.js";
import {startExpiryLoop as startRecoveryLoop} from "../inventory/worker-loop.js";
import {verifyPaymentIndexes} from "./razorpay.js";
import {verifyRefundIndexes} from "./refunds.js";
import {sweepPaymentRecovery,verifyRecoveryIndexes} from "./recovery.js";
async function main(){
  const config=loadConfig();if(!config.PAYMENT_RECOVERY_WORKER_ENABLED)throw new Error("Payment recovery worker is disabled");
  const logger=pino({level:config.LOG_LEVEL});let stopping=false;
  await connectDatabase(config.MONGODB_URI,config.NODE_ENV==="production");
  await verifyPaymentIndexes();await verifyRefundIndexes();await verifyRecoveryIndexes();
  const loop=startRecoveryLoop({intervalMs:60_000,run:()=>sweepPaymentRecovery(config,{limit:10,shouldStop:()=>stopping}),onResult:result=>{if(result.failed || result.review)logger.warn(result,"payment recovery batch needs attention");else logger.info(result,"payment recovery batch");},onError:()=>logger.error({code:"PAYMENT_RECOVERY_PASS_FAILED"},"payment recovery pass failed; leases expire for retry")});
  const shutdown=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>{process.exitCode=1;logger.error("payment recovery shutdown deadline exceeded");process.exit(1);},60_000);deadline.unref();void loop.stop().finally(()=>disconnectDatabase()).then(()=>{clearTimeout(deadline);logger.info("payment recovery worker stopped");}).catch(()=>{process.exitCode=1;logger.error("payment recovery shutdown failed");});};
  process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
}
main().catch(async()=>{console.error("Payment recovery startup failed. Check opt-in configuration, database and indexes. No secrets were logged.");process.exitCode=1;await disconnectDatabase();});
