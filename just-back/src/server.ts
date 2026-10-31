import {verifySettlementIndexes} from "./settlements/service.js";
import "dotenv/config";
import { loadConfig } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import { createApp } from "./app.js";
import { verifyCriticalIndexes } from "./common/indexes.js";
import { verifyOrderIndexes } from "./orders/routes.js";
import {verifyInventoryIndexes} from "./inventory/operations.js";
import { verifyPaymentIndexes } from "./payments/razorpay.js";
import {verifyRefundIndexes} from "./payments/refunds.js";
import {emailAvailable,verifyEmailIndexes} from "./auth/email-otp.js";
import {startupFailure} from "./common/startup-failure.js";
async function main() {
  const config = loadConfig();
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === "production");
  if (config.NODE_ENV === "production") {await verifyCriticalIndexes();await verifySettlementIndexes();}
  if(config.NODE_ENV==="production" && config.EMAIL_OTP_REQUIRED && emailAvailable(config))await verifyEmailIndexes();
  if(config.NODE_ENV==="production" && (config.ORDERS_COD_ENABLED || config.RAZORPAY_ENABLED)){await verifyOrderIndexes();await verifyInventoryIndexes();}
  if(config.NODE_ENV==="production" && config.RAZORPAY_ENABLED)await verifyPaymentIndexes();
  if(config.NODE_ENV==="production" && config.RAZORPAY_REFUNDS_ENABLED)await verifyRefundIndexes();
  const server = createApp(config).listen(config.PORT, config.HOST, () =>
    console.info("Just Pack It Phase 1 API listening"),
  );
  const shutdown = () => {
    server.close(() => {
      void disconnectDatabase().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.on("error", () => {
    console.error("Server failed to listen");
    void disconnectDatabase().finally(() => process.exit(1));
  });
}
main().catch(async (error:unknown) => {
  console.error(startupFailure(error));
  process.exitCode = 1;
  await disconnectDatabase();
});
