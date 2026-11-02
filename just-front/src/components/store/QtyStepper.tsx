import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/stores/cart";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Product } from "@/domain/types";

export function AddToBag({
  product,
  variantId,
  size = "default",
  className,
}: {
  product: Product;
  variantId?: string;
  size?: "default" | "lg";
  className?: string;
}) {
  const { quantity, add, setQty } = useCart();
  const variant = variantId ? product.variants?.find((item) => item.id === variantId) : undefined;
  const qty = quantity(product.id, variantId);
  const stock = variant ? variant.stock : product.stock;
  const disabled =
    stock <= 0 || (!!product.variants?.length && !variant) || (!!variantId && !variant);
  if (disabled) {
    return (
      <Button variant="outline" disabled size={size} className={cn("w-full", className)}>
        <UiText>
          {product.variants?.length && !variant ? "Select an option" : "Out of stock"}
        </UiText>
      </Button>
    );
  }
  if (qty === 0) {
    return (
      <Button
        variant="outline"
        size={size}
        className={cn(
          "w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground",
          className,
        )}
        onClick={() => add(product.id, variantId)}
      >
        <UiText>{"Add "}</UiText>
        <Plus />
      </Button>
    );
  }
  return (
    <UiAttributes>
      <div
        className={cn(
          "flex w-full items-center justify-between rounded-md bg-primary text-primary-foreground",
          size === "lg" ? "h-12" : "h-11",
          className,
        )}
        role="group"
        aria-label={`Quantity of ${product.name}${variant ? `, ${variant.label}` : ""}`}
      >
        <UiAttributes>
          <button
            className="flex h-full w-11 items-center justify-center rounded-l-md hover:bg-foreground/15"
            onClick={() => setQty(product.id, qty - 1, variantId)}
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
        </UiAttributes>
        <span className="font-mono text-sm tabular-nums" aria-live="polite">
          {qty}
        </span>
        <UiAttributes>
          <button
            className="flex h-full w-11 items-center justify-center rounded-r-md hover:bg-foreground/15 disabled:opacity-40"
            disabled={qty >= Math.min(stock, 999)}
            onClick={() => setQty(product.id, qty + 1, variantId)}
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </UiAttributes>
      </div>
    </UiAttributes>
  );
}
