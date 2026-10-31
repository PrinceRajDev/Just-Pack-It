import "dotenv/config";
import pino from "pino";
import {loadConfig} from "../config/env.js";
import {connectDatabase,disconnectDatabase} from "../db.js";
import {verifyInventoryIndexes} from "./operations.js";
import {sweepExpiredInventory} from "./service.js";
import {startExpiryLoop} from "./worker-loop.js";
async function main(){
  const config=loadConfig();
  if(!config.INVENTORY_EXPIRY_WORKER_ENABLED)throw new Error("Inventory worker is disabled");
  const logger=pino({level:config.LOG_LEVEL});
  await connectDatabase(config.MONGODB_URI,config.NODE_ENV==="production");
  await verifyInventoryIndexes();
  const loop=startExpiryLoop({run:()=>sweepExpiredInventory(100),onResult:result=>{
    if(result.failed)logger.error(result,"inventory expiry batch needs reconciliation");
    else logger.info(result,"inventory expiry batch");
  },onError:()=>logger.error({code:"INVENTORY_WORKER_FAILED"},"inventory expiry pass failed; retrying")});
  let stopping=false;
  const shutdown=()=>{
    if(stopping)return;stopping=true;
    const deadline=setTimeout(()=>{logger.error("inventory worker shutdown deadline exceeded");process.exit(1);},30_000);deadline.unref();
    void loop.stop().finally(()=>disconnectDatabase()).then(()=>{clearTimeout(deadline);logger.info("inventory worker stopped");}).catch(()=>{process.exitCode=1;logger.error("inventory worker shutdown failed");});
  };
  process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
}
main().catch(async()=>{
  console.error("Inventory worker startup failed. Check opt-in configuration, database and recovery indexes. No secrets were logged.");
  process.exitCode=1;await disconnectDatabase();
});
