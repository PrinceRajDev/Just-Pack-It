import { z } from "zod";
import type { Product } from "@/domain/types";
export const listingStock = (product: Product) =>
  product.variants?.length
    ? product.variants.reduce((sum, variant) => sum + variant.stock, 0)
    : product.stock;
export const variantDraftSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      label: z.string().trim().min(1, "Enter a variant name").max(100),
      price: z
        .string()
        .trim()
        .min(1, "Enter a price")
        .refine(
          (v) => Number.isFinite(Number(v)) && Number(v) > 0,
          "Price must be greater than zero",
        ),
      stock: z
        .string()
        .trim()
        .min(1, "Enter stock")
        .refine(
          (v) => Number.isInteger(Number(v)) && Number(v) >= 0,
          "Stock must be a whole number, zero or more",
        ),
      attributes: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    }),
  )
  .superRefine((variants, ctx) => {
    const names = new Set<string>();
    variants.forEach((v, i) => {
      const name = v.label.toLowerCase();
      if (names.has(name))
        ctx.addIssue({
          code: "custom",
          path: [i, "label"],
          message: "Variant names must be distinct",
        });
      names.add(name);
    });
  });
export type DraftVariant = z.infer<typeof variantDraftSchema>[number];
