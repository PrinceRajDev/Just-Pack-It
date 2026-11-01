import { useNavigate, Link, useBlocker } from "@tanstack/react-router";
import { useState, useRef, cloneElement, isValidElement, type ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { PortalHeader } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categories } from "@/mocks/data";
import { useSeller, SELLER_SHOP_ID } from "@/stores/seller";

import type { SellerProduct } from "@/stores/seller";
import { ProductImage } from "@/components/store/ProductImage";
import { isDemoMode } from "@/lib/config";
import { ErrorState } from "@/components/common/states";
import { variantDraftSchema, type DraftVariant } from "@/lib/seller-product";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "Give the product a name customers will recognise (at least 3 letters)")
      .max(80, "Keep the name under 80 letters"),
    categorySlug: z.string().min(1, "Pick an aisle"),
    unit: z.string().trim().min(1, "Say how it's sold, e.g. 1 kg, 500 ml, 6 pcs"),
    price: z.coerce
      .number({ message: "Enter the selling price in rupees" })
      .positive("Price must be more than ₹0")
      .finite("Enter a valid price"),
    mrp: z.coerce
      .number()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    stock: z.coerce
      .number({ message: "Enter how many you have" })
      .int("Use whole numbers")
      .min(0, "Stock can't be negative"),
    description: z.string().max(400).optional(),
  })
  .refine((v) => !v.mrp || v.mrp >= v.price, {
    path: ["mrp"],
    message: "MRP can't be lower than your selling price",
  });

type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

function Field({
  id,
  label,
  error,
  children,
  hint,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1">
        {isValidElement(children)
          ? cloneElement(children as ReactElement<Record<string, unknown>>, {
              "aria-invalid": error ? true : undefined,
              "aria-describedby": error || hint ? `${id}-help` : undefined,
            })
          : children}
      </div>
      {error ? (
        <p id={`${id}-help`} role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SellerProductForm({ product }: { product?: SellerProduct }) {
  const { addProduct, updateProduct } = useSeller();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<string | undefined>(product?.image);
  const [imageError, setImageError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [variantError, setVariantError] = useState("");
  const [more, setMore] = useState(!!product);
  const [variants, setVariants] = useState<DraftVariant[]>(
    () =>
      product?.variants?.map((v) => ({ ...v, price: String(v.price), stock: String(v.stock) })) ??
      [],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: product
      ? {
          name: product.name,
          categorySlug: product.categorySlug,
          unit: product.unit,
          price: product.price,
          mrp: product.mrp ?? "",
          stock: product.stock,
          description: product.description,
        }
      : { stock: 10, categorySlug: "grocery-kirana" },
  });
  const saved = useRef(false);
  const initialVariants = useRef(JSON.stringify(variants));
  const dirty =
    isDirty ||
    imageBusy ||
    preview !== product?.image ||
    JSON.stringify(variants) !== initialVariants.current;
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !saved.current,
    enableBeforeUnload: () => dirty && !saved.current,
    withResolver: true,
  });
  if (!isDemoMode)
    return (
      <ErrorState message="Seller editing is not connected yet. Your existing catalogue has not been changed." />
    );

  return (
    <>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Your product changes have not been saved. Stay here to finish, or discard this draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PortalHeader
        title={product ? "Edit product" : "Add a product"}
        sub="Changes stay in this demo session and are not saved to the server."
      />
      <form
        noValidate
        className="workspace-product-form grid gap-8 md:grid-cols-[200px_1fr]"
        onSubmit={handleSubmit(async (v) => {
          const parsed = variantDraftSchema.safeParse(variants);
          if (!parsed.success) {
            setVariantError(
              parsed.error.issues
                .map((issue) => `Option ${Number(issue.path[0]) + 1}: ${issue.message}`)
                .join(" "),
            );
            document.getElementById("variant-errors")?.focus();
            return;
          }
          setVariantError("");
          if (imageBusy || imageError) return;
          // Expected: upload image to Cloudflare via signed URL from backend, then POST /seller/products.
          const listing = {
            ...product,
            id: product?.id ?? `new-${crypto.randomUUID()}`,
            shopId: SELLER_SHOP_ID,
            image: preview,
            description: v.description ?? "",
            name: v.name,
            categorySlug: v.categorySlug,
            unit: v.unit,
            price: v.price,
            mrp: v.mrp || undefined,
            stock: v.stock,
            variants: parsed.data.map((variant) => ({
              ...variant,
              price: Number(variant.price),
              stock: Number(variant.stock),
            })),
          };
          if (product) updateProduct(product.id, listing);
          else addProduct(listing);
          saved.current = true;
          toast.success(`Product ${product ? "updated" : "added"} (demo: not saved to server)`);
          navigate({ to: "/seller/products" });
        })}
      >
        <div className="space-y-3">
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-card text-center text-sm text-muted-foreground hover:border-primary focus-within:ring-2 focus-within:ring-primary">
            {preview ? (
              <ProductImage
                src={preview}
                alt="Product preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <>
                <ImagePlus className="size-8" />
                <span className="mt-2">Add photo</span>
                <span className="text-xs">Square works best</span>
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Choose product photo"
              aria-describedby="photo-help"
              onClick={(event) => {
                event.currentTarget.value = "";
              }}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
                  f.size > 5 * 1024 * 1024
                ) {
                  setImageError("Choose a JPG, PNG or WebP image up to 5 MB.");
                  e.target.value = "";
                  return;
                }
                setImageError("");
                setImageBusy(true);
                const reader = new FileReader();
                reader.onload = () => {
                  setPreview(String(reader.result));
                  setImageBusy(false);
                };
                reader.onerror = () => {
                  setImageError("Couldn't read this photo. Try another image.");
                  setImageBusy(false);
                };
                reader.readAsDataURL(f);
              }}
            />
          </label>
          <p id="photo-help" className="text-xs text-muted-foreground">
            JPG, PNG or WebP, up to 5 MB. Preview only in this demo.
          </p>
          {imageBusy && <p role="status">Reading photo…</p>}
          {imageError && (
            <p role="alert" className="text-sm text-destructive">
              {imageError}
            </p>
          )}
          {(preview || imageError) && (
            <Button
              type="button"
              variant="outline"
              disabled={imageBusy}
              onClick={() => {
                setPreview(undefined);
                setImageError("");
              }}
            >
              Remove photo
            </Button>
          )}
        </div>
        <div className="space-y-5">
          <Field id="name" label="Product name" error={errors.name?.message}>
            <Input id="name" className="h-11" placeholder="e.g. Toor Dal" {...register("name")} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="cat" label="Aisle" error={errors.categorySlug?.message}>
              <select
                id="cat"
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                {...register("categorySlug")}
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="unit"
              label="Sold as"
              error={errors.unit?.message}
              hint="1 kg, 500 g, 6 pcs…"
            >
              <Input id="unit" className="h-11" {...register("unit")} />
            </Field>
            <Field id="price" label="Your price (₹)" error={errors.price?.message}>
              <Input id="price" inputMode="decimal" className="h-11" {...register("price")} />
            </Field>
            <Field id="stock" label="In stock" error={errors.stock?.message}>
              <Input id="stock" inputMode="numeric" className="h-11" {...register("stock")} />
            </Field>
          </div>
          {!more ? (
            <button
              type="button"
              onClick={() => setMore(true)}
              className="text-sm text-primary hover:underline"
            >
              + Add MRP and description
            </button>
          ) : (
            <>
              <Field
                id="mrp"
                label="MRP (₹, optional)"
                error={errors.mrp?.message}
                hint="Shown struck through if higher than your price"
              >
                <Input id="mrp" inputMode="decimal" className="h-11" {...register("mrp")} />
              </Field>
              <Field id="desc" label="Description (optional)" error={errors.description?.message}>
                <Textarea id="desc" rows={3} {...register("description")} />
              </Field>
            </>
          )}
          <section className="border-t border-border pt-5">
            <p
              id="variant-errors"
              tabIndex={-1}
              role={variantError ? "alert" : undefined}
              className="mb-3 text-sm text-destructive"
            >
              {variantError}
            </p>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Variants (optional)</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use for size, colour, weight, portion or pack options. Each can have its own price
                  and stock.
                </p>
                {variants.length > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Each option's price and stock apply when selected. Base price and stock do not
                    add extra variant inventory.
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setVariants((current) => [
                    ...current,
                    { id: crypto.randomUUID(), label: "", price: "", stock: "0" },
                  ])
                }
              >
                <Plus /> Add variant
              </Button>
            </div>
            {variants.length > 0 && (
              <div className="mt-4 space-y-3">
                {variants.map((variant, index) => (
                  <div key={variant.id} className="variant-draft grid gap-2">
                    <p className="col-span-full text-sm font-medium">
                      Option {index + 1} · Name, price (₹), stock
                    </p>
                    <Input
                      aria-label={`Variant ${index + 1} name`}
                      aria-invalid={!!variantError}
                      aria-describedby={variantError ? "variant-errors" : undefined}
                      value={variant.label}
                      onChange={(event) =>
                        setVariants((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="e.g. 500 g / Blue / Large"
                    />
                    <Input
                      aria-label={`Variant ${index + 1} price`}
                      aria-invalid={!!variantError}
                      aria-describedby={variantError ? "variant-errors" : undefined}
                      inputMode="decimal"
                      value={variant.price}
                      onChange={(event) =>
                        setVariants((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, price: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Price"
                    />
                    <Input
                      aria-label={`Variant ${index + 1} stock`}
                      aria-invalid={!!variantError}
                      aria-describedby={variantError ? "variant-errors" : undefined}
                      inputMode="numeric"
                      value={variant.stock}
                      onChange={(event) =>
                        setVariants((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, stock: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Stock"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setVariants((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Remove variant ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="flex gap-2 pt-2">
            <Button type="submit" size="lg" disabled={isSubmitting || imageBusy}>
              {product ? "Save changes" : "Save product"}
            </Button>
            <Button type="button" variant="ghost" size="lg" asChild>
              <Link to="/seller/products">Cancel</Link>
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
