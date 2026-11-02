import { UiText, UiAttributes } from "@/lib/i18n/Language";
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
      <UiAttributes>
        <PageTitle title={checkout ? "Review your order" : "Your bag"} eyebrow="Shop by shop">
          <p className="mt-3 text-sm text-muted-foreground">
            <UiText>{"Your items, delivery address and payment, all in one place."}</UiText>
          </p>
        </PageTitle>
      </UiAttributes>
      <AreaNotice />
      <div className="mx-auto max-w-7xl space-y-5 px-4 pb-16">
        {!lines.length ? (
          <UiAttributes>
            <EmptyState
              title="Your bag is empty"
              body="Choose a category, open a shop and add its products."
              action={
                <Button asChild>
                  <Link to="/categories">
                    <UiText>{"Explore categories"}</UiText>
                  </Link>
                </Button>
              }
            />
          </UiAttributes>
        ) : !area ? (
          <p role="status">Choose your area to check the items in your bag.</p>
        ) : quote.isPending ? (
          <p role="status">Checking current prices and stock…</p>
        ) : quote.error ? (
          <>
            <UiAttributes>
              <ErrorState
                message="Your bag could not be checked. Its contents have been kept."
                onRetry={() => void quote.refetch()}
              />
            </UiAttributes>
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
                    <UiText>{"Remove saved item"}</UiText>
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
                  <UiText>{"· India time"}</UiText>
                  <UiText>{quote.isFetching ? " · Refreshing…" : ""}</UiText>
                </p>
                <Button
                  variant="outline"
                  disabled={quote.isFetching}
                  onClick={() => void quote.refetch()}
                >
                  <UiText>{"Refresh prices and stock"}</UiText>
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
                    <UiText>{"Available options:"}</UiText>{" "}
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
                    <p className="font-medium">
                      <UiText>{"Shop item subtotal: "}</UiText>
                      {inr(group.itemsSubtotal)}
                    </p>
                    <p className="text-muted-foreground">
                      <UiText>{"Minimum:"}</UiText>{" "}
                      <UiText>
                        {group.shop.minimumOrderAmount === undefined
                          ? "Not supplied"
                          : inr(group.shop.minimumOrderAmount)}
                      </UiText>
                    </p>
                    <p className="text-muted-foreground">
                      <UiText>{"Listed delivery fee:"}</UiText>{" "}
                      <UiText>
                        {group.shop.deliveryFee === undefined
                          ? "Not supplied"
                          : inr(group.shop.deliveryFee)}
                      </UiText>{" "}
                      · Confirmed in your bill below
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
              <p className="text-sm text-muted-foreground">
                Need to check a previous order?{" "}
                <Link to="/account" className="underline">
                  Open your account
                </Link>{" "}
                before ordering again.
              </p>
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
            <UiText>{variant ? ` · ${variant.label}` : ""}</UiText>
          </Link>
        ) : (
          <h3 className="font-medium">Unavailable listing</h3>
        )}
        <p className="text-sm text-muted-foreground">
          {line.product?.unit ?? ""}
          <UiText>{line.unitPrice !== undefined ? ` · ${inr(line.unitPrice)} each` : ""}</UiText> ·
          Quantity {line.qty}
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
              <UiText>{"Accept current price"}</UiText>
            </Button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {line.availableStock !== undefined && line.availableStock > 0 && (
            <>
              <UiAttributes>
                <Button
                  variant="outline"
                  disabled={line.qty <= 1}
                  onClick={() => cart.setQty(line.productId, line.qty - 1, line.variantId)}
                  aria-label={`Decrease ${line.product?.name ?? "item"} quantity`}
                >
                  −
                </Button>
              </UiAttributes>
              <UiAttributes>
                <Button
                  variant="outline"
                  disabled={line.qty >= Math.min(line.availableStock, 999)}
                  onClick={() => cart.setQty(line.productId, line.qty + 1, line.variantId)}
                  aria-label={`Increase ${line.product?.name ?? "item"} quantity`}
                >
                  +
                </Button>
              </UiAttributes>
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
