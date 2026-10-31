import type { Product, ProductVariant } from "@/domain/types";
import { inr } from "@/lib/image";
import { AddToBag } from "./QtyStepper";
import { Button } from "@/components/ui/button";

export function MobileProductPurchase({
  product,
  variant,
}: {
  product: Product;
  variant?: ProductVariant;
}) {
  const needsOption = !!product.variants?.length && !variant;
  return (
    <section
      className="mobile-product-purchase mobile-bottom-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 shadow-lift md:hidden"
      aria-label="Quick add to bag"
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <p className="truncate text-xs text-muted-foreground">{variant?.label ?? product.name}</p>
          <p className="font-semibold tabular-nums">
            {needsOption ? "Choose an option" : inr(variant?.price ?? product.price)}
          </p>
          {!needsOption && (
            <p className="text-xs text-muted-foreground">
              {(variant?.stock ?? product.stock) > 0
                ? `${variant?.stock ?? product.stock} available`
                : "Out of stock"}
            </p>
          )}
        </div>
        <div className="w-40 shrink-0">
          {needsOption ? (
            <Button
              className="w-full"
              onClick={() => {
                const picker = document.getElementById("product-options");
                picker?.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "auto"
                    : "smooth",
                  block: "center",
                });
                picker
                  ?.querySelector<HTMLInputElement>("input:not(:disabled)")
                  ?.focus({ preventScroll: true });
              }}
            >
              Choose options
            </Button>
          ) : (
            <AddToBag product={product} variantId={variant?.id} />
          )}
        </div>
      </div>
    </section>
  );
}
