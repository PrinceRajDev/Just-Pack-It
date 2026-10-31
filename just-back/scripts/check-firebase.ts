import "dotenv/config";
import {getApps} from "firebase-admin/app";
import {loadConfig} from "../src/config/env.js";
import {firebaseMessaging} from "../src/notifications/push.js";
async function main(){
  firebaseMessaging(loadConfig());
  const app=getApps().find(app=>app.name==="just-pack-it-push")!;
  await app.options.credential!.getAccessToken();
  console.info("Firebase credential authentication passed. No notification sent; browser delivery remains unverified.");
}
main().catch(()=>{console.error("Firebase credential authentication failed. Check credential file, project and network. No secrets logged.");process.exitCode=1;});
