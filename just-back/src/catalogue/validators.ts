import { z } from "zod";
import {
  id,
  slug,
  name,
  money,
  price,
  stock,
  image,
  attributes,
  version,
  bool,
} from "../common/validation.js";
export const categoryCreate = z
  .object({
    slug,
    name,
    blurb: z.string().max(300).default(""),
    image: image.or(z.literal("")).default(""),
  })
  .strict();
export const categoryPatch = categoryCreate
  .omit({ slug: true })
  .partial()
  .extend({
    version,
    active: z.boolean().optional(),
    blurb: categoryCreate.shape.blurb.removeDefault().optional(),
    image: categoryCreate.shape.image.removeDefault().optional(),
  })
  .strict();
export const subCreate = z.object({ slug, name, version }).strict();
export const subPatch = z
  .object({ name: name.optional(), active: z.boolean().optional(), version })
  .strict();
export const areaCreate = z
  .object({
    name,
    city: name,
    pincodes: z
      .array(z.string().regex(/^\d{6}$/))
      .min(1)
      .max(100),
  })
  .strict();
export const areaPatch = areaCreate
  .partial()
  .extend({ active: z.boolean().optional(), version })
  .strict();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const opening = z
  .object({ day: z.number().int().min(0).max(6), opens: time, closes: time })
  .strict()
  .refine(
    (v) => v.opens !== v.closes,
    "Opening interval must not have equal endpoints",
  );
const shopFields = z
  .object({
    name,
    tagline: z.string().max(200).default(""),
    description: z.string().max(1000).default(""),
    locality: name,
    address: z.string().trim().min(2).max(500).optional(),
    location:z.object({type:z.literal("Point"),coordinates:z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])}).strict().optional(),
    categoryIds: z.array(id).min(1).max(30),
    subcategoryIds: z.array(id).max(50).default([]),
    serviceAreaIds: z.array(id).min(1).max(100),
    hours: z.string().max(200).default(""),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Invalid timezone")
      .default("Asia/Kolkata"),
    openingHours: z.array(opening).max(28).default([]),
    temporarilyClosed: z.boolean().default(false),
    fulfilment: z
      .array(z.enum(["pickup", "seller_delivery", "platform_delivery"]))
      .min(1)
      .max(3),
    since: z.number().int().min(1900).max(new Date().getUTCFullYear()),
    initials: z.string().min(1).max(4),
    coverImage: image.optional(),
    deliveryFee: money.optional(),
    minimumOrderAmount: money.optional(),
    pickupNote: z.string().max(400).optional(),
  })
  .strict();
export const shopCreate = shopFields.extend({ slug }).strict();
export const shopPatch = shopFields
  .partial()
  .extend({
    version,
    tagline: shopFields.shape.tagline.removeDefault().optional(),
    description: shopFields.shape.description.removeDefault().optional(),
    subcategoryIds: shopFields.shape.subcategoryIds.removeDefault().optional(),
    hours: shopFields.shape.hours.removeDefault().optional(),
    timezone: shopFields.shape.timezone.removeDefault().optional(),
    openingHours: shopFields.shape.openingHours.removeDefault().optional(),
    temporarilyClosed: shopFields.shape.temporarilyClosed
      .removeDefault()
      .optional(),
  })
  .strict();
export const approvalInput = z
  .object({
    status: z.enum(["approved", "rejected", "suspended", "pending"]),
    active: z.boolean().optional(),
    reason: z.string().trim().min(3).max(1000).optional(),
    version,
  })
  .strict().superRefine((input, context) => {
    if ((input.status === "rejected" || input.status === "suspended") && !input.reason)
      context.addIssue({code:"custom",path:["reason"],message:"Explain why the shop is rejected or suspended"});
  });
export const variantCreate = z
  .object({ label: name, price, stock, attributes: attributes.default([]) })
  .strict();
export const variantPatch = variantCreate
  .partial()
  .extend({
    version,
    attributes: variantCreate.shape.attributes.removeDefault().optional(),
  })
  .strict();
const productFields = z
  .object({
    name,
    unit: z.string().trim().min(1).max(100),
    description: z.string().max(2000).default(""),
    categoryId: id,
    subcategoryId: id.nullable().optional(),
    price,
    mrp: money.nullable().optional(),
    stock,
    image: image.nullable().optional(),
    attributes: attributes.default([]),
    tags: z
      .array(z.enum(["fresh", "bestseller", "new", "essential"]))
      .max(4)
      .default([]),
    active: z.boolean().default(true),
  })
  .strict();
export const productCreate = productFields
  .extend({ variants: z.array(variantCreate).max(100).default([]) })
  .strict();
export const productPatch = productFields
  .partial()
  .extend({
    version,
    description: productFields.shape.description.removeDefault().optional(),
    attributes: productFields.shape.attributes.removeDefault().optional(),
    tags: productFields.shape.tags.removeDefault().optional(),
    active: productFields.shape.active.removeDefault().optional(),
  })
  .strict();
export const inventoryPatch = z.object({ stock, version }).strict();
export const deleteInput = z.object({ version }).strict();
export const privateListQuery = z
  .object({
    cursor: z.string().max(3000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const baseQuery = {
  lat:z.coerce.number().min(-90).max(90).optional(),
  lng:z.coerce.number().min(-180).max(180).optional(),
  q: z.string().trim().max(80).optional(),
  area: id.optional(),
  category: slug.optional(),
  subcategory: slug.optional(),
  cursor: z.string().max(3000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
};
export const productQuery = z
  .object({
    ...baseQuery,
    shop: id.optional(),
    sort: z
      .enum(["relevance", "price_asc", "price_desc", "name"])
      .default("relevance"),
    inStockOnly: bool,
    offersOnly: bool,
  })
  .strict();
export const shopQuery = z
  .object({
    ...baseQuery,
    sort: z
      .enum(["recommended", "open", "name", "fee_asc", "fee_desc"])
      .default("recommended"),
    openOnly: bool,
    fulfilment: z
      .enum(["pickup", "delivery", "seller_delivery", "platform_delivery"])
      .optional(),
  })
  .strict();
export type ProductInput = z.infer<typeof productCreate>;
export type ProductPatch = z.infer<typeof productPatch>;
export type ShopInput = z.infer<typeof shopCreate>;
export type ShopPatch = z.infer<typeof shopPatch>;
