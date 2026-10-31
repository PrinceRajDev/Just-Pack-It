import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCart, cartLineKey } from "@/stores/cart";
import { useLocationArea } from "@/stores/location";
import { reviewCart } from "@/services/cart-review";
import type { CartReviewLine } from "@/domain/cart-review";
import { StoreLayout, PageTitle } from "./StoreLayout";
import { AreaNotice } from "./AreaNotice";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ProductImage } from "./ProductImage";
import { inr } from "@/lib/image";
import { fulfilmentLabel } from "./ShopMark";
import { AddressDeliveryReview } from "./AddressDeliveryReview";

export function LiveCart({ checkout = false }: { checkout?: boolean }) {
  const cart = useCart();
  const { area, ready } = useLocationArea();
  const lines = Object.values(cart.lines);
  const items = lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty }));
  const quote = useQuery({
    queryKey: ["cart-review", area?.id, items],
    queryFn: ({ signal }) => reviewCart(area!.id, lines, signal),
    enabled: ready && !!area && lines.length > 0,
    retry: false,
    staleTime: 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  return (
    <StoreLayout>
      <PageTitle title={checkout ? "Review your order" : "Your bag"} eyebrow="Shop by shop">
        <p className="mt-3 text-sm text-muted-foreground">
          Review current prices and stock. This review does not reserve items. Available payment
          methods are confirmed by the server.
        </p>
      </PageTitle>
      <AreaNotice />
      <div className="mx-auto max-w-7xl space-y-5 px-4 pb-16">
        {!lines.length ? (
          <EmptyState
            title="Your bag is empty"
            body="Choose a category, open a shop and add its products."
            action={
              <Button asChild>
                <Link to="/categories">Explore categories</Link>
              </Button>
            }
          />
        ) : !area ? (
          <p role="status">Choose your area to check the items in your bag.</p>
        ) : quote.isPending ? (
          <p role="status">Checking current prices and stock…</p>
        ) : quote.error ? (
          <>
            <ErrorState
              message="Your bag could not be checked. Its contents have been kept."
              onRetry={() => void quote.refetch()}
            />
            <ul className="space-y-2">
              {lines.map((line) => (
                <li
                  key={cartLineKey(line.productId, line.variantId)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <span>Saved item · {line.productId}</span>
                  <Button
                    variant="outline"
                    onClick={() => cart.remove(line.productId, line.variantId)}
                  >
                    Remove saved item
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          quote.data && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Checked:{" "}
                  {new Date(quote.data.checkedAt).toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  · India time{quote.isFetching ? " · Refreshing…" : ""}
                </p>
                <Button
                  variant="outline"
                  disabled={quote.isFetching}
                  onClick={() => void quote.refetch()}
                >
                  Refresh prices and stock
                </Button>
              </div>
              {quote.data.shops.map((group) => (
                <section
                  key={group.shop.id}
                  className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-6"
                >
                  <h2 className="font-display text-2xl">
                    <Link to="/shop/$slug" params={{ slug: group.shop.slug }}>
                      {group.shop.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Available options:{" "}
                    {group.shop.fulfilment.map((method) => fulfilmentLabel[method]).join(", ")}
                  </p>
                  {group.issues.map((issue) => (
                    <p key={issue.code} className="text-sm text-destructive">
                      {issue.message}
                    </p>
                  ))}
                  <ul className="divide-y divide-border">
                    {quote
                      .data!.lines.filter((line) => line.shopId === group.shop.id)
                      .map((line) => (
                        <li key={cartLineKey(line.productId, line.variantId)}>
                          <ReviewLine line={line} />
                        </li>
                      ))}
                  </ul>
                  <div className="space-y-1 border-t border-border pt-3 text-sm">
                    <p className="font-medium">Shop item subtotal: {inr(group.itemsSubtotal)}</p>
                    <p className="text-muted-foreground">
                      Minimum:{" "}
                      {group.shop.minimumOrderAmount === undefined
                        ? "Not supplied"
                        : inr(group.shop.minimumOrderAmount)}
                    </p>
                    <p className="text-muted-foreground">
                      Listed delivery fee:{" "}
                      {group.shop.deliveryFee === undefined
                        ? "Not supplied"
                        : inr(group.shop.deliveryFee)}{" "}
                      · Final delivery quote unavailable
                    </p>
                  </div>
                </section>
              ))}
              {quote.data.lines
                .filter((line) => !line.shopId)
                .map((line) => (
                  <div
                    key={cartLineKey(line.productId, line.variantId)}
                    className="rounded-xl border border-destructive/30 p-4"
                  >
                    <ReviewLine line={line} />
                  </div>
                ))}
              {quote.data.shops.length > 0 && (
                <AddressDeliveryReview
                  shops={quote.data.shops.map((group) => group.shop)}
                  lines={lines}
                  areaId={area.id}
                />
              )}
              <section className="space-y-3 rounded-xl border border-primary/20 bg-secondary/40 p-5">
                <h2 className="font-display text-2xl">
                  Current item subtotal: {inr(quote.data.itemsSubtotal)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Includes priced requested quantities, even when stock is short or a shop is
                  closed. Unpriced unavailable lines are excluded. This item subtotal does not
                  include delivery charges. See the selected-address review above for any available
                  COD total.
                </p>
                {!checkout && (
                  <Button asChild variant="outline">
                    <Link to="/checkout">Review address and methods</Link>
                  </Button>
                )}
                <p className="text-sm">
                  Unconfirmed previous order?{" "}
                  <Link to="/account" className="underline">
                    Recover it from your account
                  </Link>{" "}
                  before submitting another.
                </p>
                <p className="text-xs text-muted-foreground">
                  This check does not reserve inventory, create an order or take payment.
                </p>
              </section>
            </>
          )
        )}
      </div>
    </StoreLayout>
  );
}
function ReviewLine({ line }: { line: CartReviewLine }) {
  const cart = useCart();
  const saved = cart.lines[cartLineKey(line.productId, line.variantId)];
  const variant = line.product?.variants?.find((variant) => variant.id === line.variantId);
  const changed =
    saved?.acceptedPrice !== undefined &&
    line.unitPrice !== undefined &&
    saved.acceptedPrice !== line.unitPrice;
  return (
    <article className="flex flex-wrap items-start gap-3 py-4">
      <div className="w-20 shrink-0">
        <ProductImage
          src={line.product?.image}
          alt={line.product?.name ?? "Unavailable listing"}
          width={120}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {line.product ? (
          <Link
            to="/product/$id"
            params={{ id: line.productId }}
            className="font-medium hover:underline"
          >
            {line.product.name}
            {variant ? ` · ${variant.label}` : ""}
          </Link>
        ) : (
          <h3 className="font-medium">Unavailable listing</h3>
        )}
        <p className="text-sm text-muted-foreground">
          {line.product?.unit ?? ""}
          {line.unitPrice !== undefined ? ` · ${inr(line.unitPrice)} each` : ""} · Quantity{" "}
          {line.qty}
        </p>
        {line.issues.map((issue) => (
          <p key={issue.code} className="text-sm text-destructive">
            {issue.message}
          </p>
        ))}
        {changed && (
          <p className="text-sm text-destructive">
            Price changed from {inr(saved!.acceptedPrice!)} to {inr(line.unitPrice!)}.{" "}
            <Button
              variant="outline"
              onClick={() => cart.acceptPrice(line.productId, line.variantId)}
            >
              Accept current price
            </Button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {line.availableStock !== undefined && line.availableStock > 0 && (
            <>
              <Button
                variant="outline"
                disabled={line.qty <= 1}
                onClick={() => cart.setQty(line.productId, line.qty - 1, line.variantId)}
                aria-label={`Decrease ${line.product?.name ?? "item"} quantity`}
              >
                −
              </Button>
              <Button
                variant="outline"
                disabled={line.qty >= Math.min(line.availableStock, 999)}
                onClick={() => cart.setQty(line.productId, line.qty + 1, line.variantId)}
                aria-label={`Increase ${line.product?.name ?? "item"} quantity`}
              >
                +
              </Button>
              {line.qty > line.availableStock && (
                <Button
                  variant="outline"
                  onClick={() => cart.setQty(line.productId, line.availableStock!, line.variantId)}
                >
                  Reduce to {line.availableStock}
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={() => cart.remove(line.productId, line.variantId)}>
            Remove item
          </Button>
        </div>
      </div>
      {line.lineTotal !== undefined && <p className="font-semibold">{inr(line.lineTotal)}</p>}
    </article>
  );
}
