import { productDraftRoutes } from "./ai/product-draft.js";
import {platformAdminRoutes,platformPublicRoutes} from "./platform/settings.js";
import {adminReportRoutes} from "./admin/reports.js";
import {adminUserRoutes} from "./admin/users.js";
import {settlementRoutes} from "./settlements/routes.js";
import {deliveryExceptionAdminRoutes,deliveryReturnSellerRoutes} from "./delivery/exceptions.js";
import {adminWorkspaceRoutes} from "./admin/workspace.js";
import {deliveryRoutes,deliveryAdminRoutes,deliverySellerRoutes} from "./delivery/routes.js";
import { sellerDashboardRoutes } from "./orders/dashboard.js";
import {supportRoutes} from "./support/routes.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pino from "pino";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { Config } from "./config/env.js";
import { errorHandler, fail, AppError } from "./common/errors.js";
import { authRoutes } from "./auth/routes.js";
import { authenticate, requireRole } from "./auth/middleware.js";
import { publicRoutes, sellerRoutes, adminRoutes } from "./catalogue/routes.js";
import { adminSellerRoutes } from "./auth/admin-sellers.js";
import { imageRoutes } from "./images/routes.js";
import {cartRoutes} from "./cart/routes.js";
import { addressRoutes } from "./addresses/routes.js";
import { fulfilmentRoutes } from "./cart/fulfilment.js";
import { checkoutReviewRoutes } from "./cart/checkout-review.js";
import { inventoryAdminRoutes } from "./inventory/operations.js";
import { orderRoutes } from "./orders/routes.js";
import { adminOrderRoutes } from "./orders/admin.js";
import { razorpayBuyerRoutes,razorpayWebhookRoutes,razorpayAdminRoutes } from "./payments/razorpay.js";
import {refundAdminRoutes} from "./payments/refunds.js";
import {notificationRoutes} from "./notifications/routes.js";
import {operationsRoutes} from "./orders/operations.js";
import {pushRoutes} from "./notifications/push-routes.js";
import { sellerOrderRoutes } from "./orders/seller.js";
import { buyerReceiptRoutes,sellerReceiptRoutes } from "./orders/receipts.js";
export function createApp(config: Config) {
  const app = express();
  const logger = pino({ level: config.LOG_LEVEL });
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.set("query parser", "simple");
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-ID", res.locals.requestId);
    res.on("finish", () =>
      logger[res.statusCode >= 500 ? "error" : "info"](
        {
          requestId: res.locals.requestId,
          method: req.method,
          status: res.statusCode,
          code: res.locals.errorCode,
        },
        "request",
      ),
    );
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.CORS_ORIGINS.includes(origin))
          callback(null, true);
        else callback(new AppError(403, "ORIGIN_DENIED", "Origin not allowed"));
      },
      exposedHeaders: [
        "X-Next-Cursor",
        "X-Total-Count",
        "X-Has-More",
        "X-Request-ID",
      ],
    }),
  );
  app.use("/webhooks",razorpayWebhookRoutes(config));
  app.use(express.json({ limit: "128kb", strict: true }));
  app.use(
    rateLimit({
      windowMs: 900000,
      limit: 1000,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          message: "Too many requests",
          code: "RATE_LIMITED",
          requestId: res.locals.requestId,
        }),
    }),
  );
  app.get("/health", (_req, res) => res.json({ status: "ok", phase: 1 }));
  app.get("/health/ready", (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "not_ready" });
  });
  app.use("/platform-settings",platformPublicRoutes());
  app.use("/auth", authRoutes(config));
  app.use("/notifications",authenticate(config),pushRoutes(config),notificationRoutes(config));
  app.use("/payments/razorpay",razorpayBuyerRoutes(config));
  app.use("/settlements",authenticate(config),settlementRoutes(config));
  app.use("/support", authenticate(config), supportRoutes(config));
  app.use("/addresses", authenticate(config), addressRoutes());
  app.use("/checkout", authenticate(config), checkoutReviewRoutes(config));
  app.use("/orders",authenticate(config),requireRole("buyer"),buyerReceiptRoutes(config),orderRoutes(config));
  app.use("/delivery",authenticate(config),requireRole("delivery"),deliveryRoutes(config));
  app.use("/cart",cartRoutes());
  app.use("/cart", authenticate(config), fulfilmentRoutes(config));
  app.use(publicRoutes(config));
  app.use(
    "/seller",
    authenticate(config),
    requireRole("seller"),
    deliveryReturnSellerRoutes(),
    deliverySellerRoutes(),
    sellerReceiptRoutes(config),
    sellerDashboardRoutes(),
    sellerOrderRoutes(config),
    productDraftRoutes(config),
    imageRoutes(config),
    sellerRoutes(config),
  );
  app.use(
    "/admin",
    authenticate(config),
    requireRole("admin"),
    platformAdminRoutes(config),
    adminReportRoutes(),
    adminUserRoutes(config),
    adminWorkspaceRoutes(config),
    deliveryExceptionAdminRoutes(config),
    deliveryAdminRoutes(),
    operationsRoutes(),
    refundAdminRoutes(config),
    razorpayAdminRoutes(config),
    adminOrderRoutes(config),
    inventoryAdminRoutes(config),
    adminSellerRoutes(config),
    adminRoutes(config),
  );
  app.use((_req, _res) => fail(404, "NOT_FOUND", "Route not found"));
  app.use(errorHandler);
  return app;
}
