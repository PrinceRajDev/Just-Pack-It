import "dotenv/config";
import {deploymentReadiness} from "../src/config/readiness.js";
const report=deploymentReadiness(process.env);
console.info(JSON.stringify(report,null,2));
if(!report.configurationReady)process.exitCode=1;
