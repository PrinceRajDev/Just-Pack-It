import "dotenv/config";
import {loadConfig} from "../config/env.js";
import {connectDatabase,disconnectDatabase} from "../db.js";
import {firebaseMessaging,sweepPush,verifyPushIndexes} from "./push.js";
async function main(){
  const config=loadConfig();firebaseMessaging(config);
  await connectDatabase(config.MONGODB_URI,config.NODE_ENV==="production");
  if(config.NODE_ENV==="production")await verifyPushIndexes();
  let stopping=false;let wake:(()=>void)|undefined;
  const stop=()=>{stopping=true;wake?.();};
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  console.info("Firebase push worker started; acceptance is not proof of device delivery.");
  while(!stopping){
    try{const result=await sweepPush(config);if(Object.values(result).some(Boolean))console.info(result);}
    catch{console.error("Push pass failed; retrying. No tokens or credentials logged.");}
    if(!stopping)await new Promise<void>(resolve=>{const timer=setTimeout(resolve,10000);wake=()=>{clearTimeout(timer);resolve();};});
  }
  await disconnectDatabase();
}
main().catch(async()=>{console.error("Push worker startup failed. Verify project, credential file and database. No secrets logged.");process.exitCode=1;await disconnectDatabase();});
