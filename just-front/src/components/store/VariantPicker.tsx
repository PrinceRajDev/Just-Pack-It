import { useId } from "react";
import { Check } from "lucide-react";
import type { ProductVariant } from "@/domain/types";
import { cn } from "@/lib/utils";

/** Each button represents one real combination, never a fabricated size/colour pairing. */
export function VariantPicker({
  variants,
  selectedId,
  onSelect,
}: {
  variants: ProductVariant[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const id = useId();
  const fields = [...new Set(variants.flatMap((v) => v.attributes?.map((a) => a.label) ?? []))];
  return (
    <fieldset
      className="product-variant-picker mt-6 rounded-xl border border-border bg-paper p-4 text-sm"
      aria-describedby={`${id}-hint`}
    >
      <legend className="px-1 font-semibold">
        {fields.length ? `Choose ${fields.join(" / ")}` : "Choose your option"}
      </legend>
      <p id={`${id}-hint`} className="text-muted-foreground">
        Select one option. Each has its own price and stock at this shop.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          const unavailable = variant.stock <= 0;
          return (
            <label
              key={variant.id}
              className={cn(
                "relative flex min-w-0 cursor-pointer rounded-xl border bg-card p-3 transition hover:border-primary",
                selected ? "border-primary bg-secondary ring-1 ring-primary" : "border-border",
                unavailable && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={`${id}-variant`}
                value={variant.id}
                checked={selected}
                disabled={unavailable}
                onChange={() => onSelect(variant.id)}
                className="peer sr-only"
                aria-label={`${variant.label}${variant.attributes?.length ? `, ${variant.attributes.map((a) => `${a.label}: ${a.value}`).join(", ")}` : ""}, ₹${variant.price}, ${unavailable ? "Unavailable" : `${variant.stock} available`}`}
              />
              <span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2 font-semibold">
                  <span className="break-words">{variant.label}</span>
                  {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </span>
                {!!variant.attributes?.length && (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {variant.attributes.map((a, i) => (
                      <span
                        key={`${a.label}-${i}`}
                        className="rounded-md bg-muted px-2 py-1 text-xs"
                      >
                        {a.label}: {a.value}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-3 flex flex-wrap justify-between gap-2">
                  <span className="font-semibold tabular-nums">
                    ₹{variant.price.toLocaleString("en-IN")}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      unavailable ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {unavailable ? "Unavailable" : `${variant.stock} available`}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
