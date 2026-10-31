import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { management } from "@/services/management";
import { ErrorState } from "@/components/common/states";
import { Field } from "@/components/portal/management-shared";
export const sellerShopSchema = z.object({
  name: z.string().trim().min(2, "Enter your shop name").max(100),
  address: z.string().trim().min(2, "Enter your shop address").max(500),
  categoryIds: z.array(z.string().uuid()).min(1, "Choose a shop type"),
  serviceAreaIds: z.array(z.string().uuid()).min(1, "Choose your service area"),
  since: z.coerce
    .number()
    .int()
    .min(1900, "Enter the year your shop opened")
    .max(new Date().getFullYear()),
  fulfilment: z
    .array(z.enum(["pickup", "seller_delivery", "platform_delivery"]))
    .min(1, "Choose a fulfilment option"),
});
export function readSellerShop(data: FormData) {
  return sellerShopSchema.parse({
    name: data.get("shopName"),
    address: data.get("shopAddress"),
    categoryIds: data.getAll("shopCategoryIds"),
    serviceAreaIds: data.getAll("shopAreaIds"),
    since: data.get("shopSince"),
    fulfilment: data.getAll("shopFulfilment"),
  });
}
export function SellerSignupFields({ onReady }: { onReady: (ready: boolean) => void }) {
  const categories = useQuery({ queryKey: ["categories"], queryFn: management.categories });
  const areas = useQuery({ queryKey: ["areas"], queryFn: management.areas });
  const ready =
    !!categories.data?.length && !!areas.data?.length && !categories.isError && !areas.isError;
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  if (categories.error || areas.error)
    return (
      <ErrorState
        message="Shop setup options could not be loaded. Retry to register as a seller."
        onRetry={() => {
          void categories.refetch();
          void areas.refetch();
        }}
      />
    );
  if (categories.isPending || areas.isPending)
    return <p role="status">Loading shop types and service areas…</p>;
  if (!ready)
    return (
      <p role="alert" className="text-sm">
        Seller signup is not available until the platform configures shop types and service areas.
      </p>
    );
  return (
    <fieldset className="auth-shop-fields space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
      <legend className="px-1 font-display text-xl">Your shop</legend>
      <Field label="Shop name" name="shopName" required />
      <label className="block space-y-1 text-sm">
        <span>Full shop address</span>
        <textarea
          name="shopAddress"
          required
          maxLength={500}
          rows={3}
          autoComplete="street-address"
          className="block w-full rounded-md border border-input bg-background p-2"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Shop type / categories</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.data.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="shopCategoryIds" value={category.id} />
              {category.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span>Service area</span>
        <select
          name="shopAreaIds"
          required
          defaultValue=""
          className="block w-full rounded-md border border-input bg-background p-2"
        >
          <option value="">Choose your area</option>
          {areas.data.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name} · {area.pincodes.join(", ")}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Year your shop opened"
        name="shopSince"
        type="number"
        min={1900}
        max={new Date().getFullYear()}
        required
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How will customers receive items?</legend>
        {(
          [
            ["pickup", "Pickup from shop"],
            ["seller_delivery", "Shop's own delivery"],
            ["platform_delivery", "Platform delivery (dispatch not live yet)"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shopFulfilment" value={value} />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Your shop will be submitted for admin approval. Add operating hours and products from your
        seller workspace after signup. Your shop stays off the public marketplace until approved.
      </p>
    </fieldset>
  );
}
