import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useCart } from "@/stores/cart";
import { productById, shopById } from "@/services/catalog";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
export function CartRecovery() {
  const { lines, setQty, remove, acceptPrice } = useCart();
  return (
    <>
      {Object.values(lines).map((line) => {
        const p = productById(line.productId);
        if (!p) return null;
        const v = p.variants?.find((item) => item.id === line.variantId);
        if ((p.variants?.length && !v) || (line.variantId && !v)) return null;
        const stock = v?.stock ?? p.stock,
          price = v?.price ?? p.price;
        const changed = line.acceptedPrice !== undefined && line.acceptedPrice !== price;
        if (!changed && line.qty <= stock) return null;
        return (
          <UiAttributes key={`${p.id}-${line.variantId}`}>
            <section
              key={`${p.id}-${line.variantId}`}
              aria-label={`Resolve ${p.name}`}
              className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
            >
              <h2 className="font-semibold">
                {p.name}
                <UiText>{v ? ` · ${v.label}` : ""}</UiText>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {shopById(p.shopId)?.name ?? "Shop listing"}
              </p>
              {changed && (
                <p className="mt-2">
                  Price changed: {inr(line.acceptedPrice!)} → {inr(price)} per item.
                </p>
              )}
              {line.qty > stock && (
                <p className="mt-2">
                  <UiText>
                    {stock > 0
                      ? `Only ${stock} available; your bag has ${line.qty}.`
                      : "This item is now out of stock."}
                  </UiText>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {changed && (
                  <Button variant="outline" onClick={() => acceptPrice(p.id, line.variantId)}>
                    <UiText>{"Accept current price"}</UiText>
                  </Button>
                )}
                {stock > 0 && line.qty > stock && (
                  <Button variant="outline" onClick={() => setQty(p.id, stock, line.variantId)}>
                    Reduce to {stock}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => remove(p.id, line.variantId)}>
                  Remove item
                </Button>
              </div>
            </section>
          </UiAttributes>
        );
      })}
    </>
  );
}
