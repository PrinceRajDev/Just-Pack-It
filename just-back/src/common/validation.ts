import { z } from "zod";
export const id = z.string().uuid();
export const slug = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const name = z.string().trim().min(2).max(100);
export const money = z
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    "At most two decimal places",
  );
export const price = money.refine((v) => v > 0, "Price must be positive");
export const stock = z.number().int().min(0).max(100000000);
export const image = z
  .string()
  .max(500)
  .refine(
    (v) =>
      !v.startsWith("data:") &&
      !v.startsWith("blob:") &&
      !v.includes("..") &&
      !/[<>]/.test(v) &&
      ![...v].some((char) => char.charCodeAt(0) < 32) &&
      (!v.includes("://") || v.startsWith("https://")),
    "Use a durable image key or HTTPS URL",
  );
export const attributes = z
  .array(
    z
      .object({ label: name, value: z.string().trim().min(1).max(200) })
      .strict(),
  )
  .max(30);
export const version = z.number().int().min(0);
export const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();
