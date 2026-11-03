import {PlatformSettings} from "../src/platform/settings.js";
import {Settlement,Journal,Remittance,Payout,RiderPayout} from "../src/settlements/models.js";
import {Audit} from "../src/admin/audit.js";
import {SupportMessage} from "../src/support/conversation.js";
import {Partner} from "../src/delivery/models.js";
import {SupportTicket} from "../src/support/routes.js";
import "dotenv/config";
import { loadConfig } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/db.js";
import { User, Session, Throttle } from "../src/auth/models.js";
import { Category, Area, Shop, Product } from "../src/catalogue/models.js";
import { Address } from "../src/addresses/routes.js";
import { InventoryReservation } from "../src/inventory/models.js";
import { Order } from "../src/orders/models.js";
import { OnlinePayment,PaymentEvent,PaymentAudit } from "../src/payments/razorpay.js";
import {Refund} from "../src/payments/refund-model.js";
import {Notification,NotificationRead} from "../src/notifications/service.js";
import {PushSubscription,PushJob} from "../src/notifications/push-models.js";
import {EmailChallenge,EmailCooldown} from "../src/auth/email-otp.js";
async function main() {
  const config = loadConfig();
  await connectDatabase(config.MONGODB_URI, config.NODE_ENV === "production");
  try {
    for (const model of [
      PlatformSettings,
      Settlement,Journal,Remittance,Payout,RiderPayout,
      SupportTicket,
      Audit,
      SupportMessage,
      Partner,
      User,
      EmailChallenge,
      EmailCooldown,
      Session,
      Throttle,
      Category,
      Area,
      Shop,
      Product,
      Address,
      InventoryReservation,
      Order,
      OnlinePayment,
      PaymentEvent,
      PaymentAudit,
      Refund,
      Notification,
      NotificationRead,
      PushSubscription,
      PushJob,
    ])
      await model.createIndexes();
    console.info(
      "Declared indexes created; no collections or existing indexes were dropped.",
    );
  } finally {
    await disconnectDatabase();
  }
}
main().catch(() => {
  console.error(
    "Index creation failed. Resolve conflicting data/indexes through an operator-reviewed migration.",
  );
  process.exitCode = 1;
});
