import { z } from "zod";
const secret = z
  .string()
  .min(32)
  .refine(
    (v) => !/replace|example|placeholder/i.test(v),
    "Use an independently generated random secret",
  );
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    CORS_ORIGINS: z
      .string()
      .transform((v) => v.split(",").map((s) => s.trim()))
      .pipe(z.array(z.string().url()).min(1)),
    SESSION_PEPPER: secret,
    CURSOR_SECRET: secret,
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
    EMAIL_OTP_REQUIRED:z.enum(["true","false"]).default("true").transform(value=>value==="true"),
    GOOGLE_SIGN_IN_ENABLED:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    EMAIL_OTP_SECRET:secret.optional(),
    EMAIL_OTP_DAILY_LIMIT:z.coerce.number().int().min(1).max(300).default(200),
    EMAIL_OTP_TEST_RECIPIENT:z.email().optional(),
    EMAIL_OTP_TEST_UNTIL:z.iso.datetime().optional(),
    BREVO_API_KEY:z.string().min(20).optional(),
    EMAIL_FROM:z.email().optional(),
    FIREBASE_PUSH_ENABLED:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    FIREBASE_PROJECT_ID:z.string().regex(/^[a-z][a-z0-9-]{4,62}$/).optional(),
    GOOGLE_APPLICATION_CREDENTIALS:z.string().min(1).optional(),
    INVENTORY_EXPIRY_WORKER_ENABLED: z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    PLATFORM_DELIVERY_ENABLED:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    ORDERS_COD_ENABLED: z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    RAZORPAY_ENABLED: z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    PAYMENT_RECOVERY_WORKER_ENABLED: z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    RAZORPAY_REFUNDS_ENABLED: z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    RAZORPAY_LIVE_ENABLED: z.enum(["true","false"]).default("false").transform(value=>value==="true"),
    RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(20).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(32).optional(),
    LOG_LEVEL: z
      .enum(["silent", "error", "warn", "info", "debug"])
      .default("info"),
    CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
    IMAGE_STORAGE_PROVIDER: z.enum(["cloudflare_images","r2"]).default("cloudflare_images"),
    R2_ALLOW_DEV_PUBLIC_URL: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
    CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(32).optional(),
    CLOUDFLARE_R2_BUCKET: z.string().min(3).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).optional(),
    CLOUDFLARE_R2_PUBLIC_BASE_URL: z.string().max(350).url().refine(value=>{const url=new URL(value);return url.protocol==="https:" && !url.username && !url.password && !url.search && !url.hash && !url.pathname.includes("..") && !url.hostname.endsWith("r2.cloudflarestorage.com");},"Use an HTTPS public delivery URL, not the S3 endpoint").optional(),
    CLOUDFLARE_IMAGES_API_TOKEN: z.string().min(20).refine(value=>!/replace|placeholder|your-token/i.test(value)).optional(),
    CLOUDFLARE_IMAGES_ACCOUNT_HASH: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/).optional(),
    CLOUDFLARE_IMAGES_VARIANT: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).default("public"),
  })
  .superRefine((value, ctx) => {
    if(value.GOOGLE_SIGN_IN_ENABLED && (!value.FIREBASE_PROJECT_ID || !value.GOOGLE_APPLICATION_CREDENTIALS))ctx.addIssue({code:"custom",path:["GOOGLE_SIGN_IN_ENABLED"],message:"Configure Firebase project and admin credential file before enabling Google sign-in"});
    if(value.EMAIL_OTP_SECRET && [value.SESSION_PEPPER,value.CURSOR_SECRET].includes(value.EMAIL_OTP_SECRET))ctx.addIssue({code:"custom",path:["EMAIL_OTP_SECRET"],message:"Use an independent email OTP secret"});
    if(value.FIREBASE_PUSH_ENABLED && (!value.FIREBASE_PROJECT_ID || !value.GOOGLE_APPLICATION_CREDENTIALS))ctx.addIssue({code:"custom",path:["FIREBASE_PUSH_ENABLED"],message:"Configure Firebase project and credential file before enabling"});
    if(value.PAYMENT_RECOVERY_WORKER_ENABLED && !value.RAZORPAY_ENABLED)ctx.addIssue({code:"custom",path:["PAYMENT_RECOVERY_WORKER_ENABLED"],message:"Recovery requires configured Razorpay integration"});
    if(value.RAZORPAY_REFUNDS_ENABLED && !value.RAZORPAY_ENABLED)ctx.addIssue({code:"custom",path:["RAZORPAY_REFUNDS_ENABLED"],message:"Refund submission requires configured Razorpay integration"});
    if(value.RAZORPAY_ENABLED && (!value.RAZORPAY_KEY_ID || !value.RAZORPAY_KEY_SECRET || !value.RAZORPAY_WEBHOOK_SECRET))ctx.addIssue({code:"custom",path:["RAZORPAY_ENABLED"],message:"Configure all Razorpay credentials before enabling"});
    if(value.RAZORPAY_ENABLED && value.RAZORPAY_KEY_ID?.startsWith("rzp_live_") && !value.RAZORPAY_LIVE_ENABLED)ctx.addIssue({code:"custom",path:["RAZORPAY_LIVE_ENABLED"],message:"Live payments require explicit activation"});
    const imageSettings=[value.CLOUDFLARE_ACCOUNT_ID,value.CLOUDFLARE_IMAGES_API_TOKEN,value.CLOUDFLARE_IMAGES_ACCOUNT_HASH];
    if(value.IMAGE_STORAGE_PROVIDER==="cloudflare_images" && imageSettings.some(Boolean) && !imageSettings.every(Boolean)) ctx.addIssue({code:"custom",path:["CLOUDFLARE_IMAGES_API_TOKEN"],message:"Configure all Cloudflare Images settings together"});
    if(value.IMAGE_STORAGE_PROVIDER==="r2" && ![value.CLOUDFLARE_ACCOUNT_ID,value.CLOUDFLARE_R2_ACCESS_KEY_ID,value.CLOUDFLARE_R2_SECRET_ACCESS_KEY,value.CLOUDFLARE_R2_BUCKET,value.CLOUDFLARE_R2_PUBLIC_BASE_URL].every(Boolean))ctx.addIssue({code:"custom",path:["CLOUDFLARE_R2_BUCKET"],message:"Configure all R2 upload settings"});
    if(value.NODE_ENV==="production" && value.IMAGE_STORAGE_PROVIDER==="r2" && value.CLOUDFLARE_R2_PUBLIC_BASE_URL && new URL(value.CLOUDFLARE_R2_PUBLIC_BASE_URL).hostname.endsWith(".r2.dev") && !value.R2_ALLOW_DEV_PUBLIC_URL)ctx.addIssue({code:"custom",path:["CLOUDFLARE_R2_PUBLIC_BASE_URL"],message:"Use a custom R2 delivery domain or explicitly enable the pilot development URL allowance"});
    if (value.SESSION_PEPPER === value.CURSOR_SECRET)
      ctx.addIssue({
        code: "custom",
        path: ["CURSOR_SECRET"],
        message: "Use a separate secret",
      });
    if (
      value.NODE_ENV === "production" &&
      value.CORS_ORIGINS.some((origin) => !origin.startsWith("https://"))
    )
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "HTTPS origins required in production",
      });
  });
export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration fields: ${[...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ")}`,
    );
  return result.data;
}
