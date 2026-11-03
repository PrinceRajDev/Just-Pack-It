import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Trash2 } from "lucide-react";
import { StoreLayout, PageTitle } from "@/components/store/StoreLayout";
import {
  Totals,
  useBagGroups,
  BagIssues,
  ShopCheckoutDetails,
} from "@/components/store/BagSummary";
import { ProductImage } from "@/components/store/ProductImage";
import { AddToBag } from "@/components/store/QtyStepper";
import { fulfilmentLabel, ShopInitials } from "@/components/store/ShopMark";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useCart } from "@/stores/cart";
import { inr } from "@/lib/image";
import { CheckoutProgress } from "@/components/store/CheckoutProgress";
import { CartRecovery } from "@/components/store/CartRecovery";
import { isDemoMode } from "@/lib/config";
import { LiveCart } from "@/components/store/LiveCart";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your bag: Just Pack It" },
      { name: "description", content: "Review items from each shop before checkout." },
      { property: "og:title", content: "Your bag: Just Pack It" },
      { property: "og:description", content: "Items grouped by local shop." },
    ],
  }),
  component: isDemoMode ? CartPage : LiveCart,
});

function CartPage() {
  const { groups, itemsTotal, delivery, savings, total, issues, canCheckout } = useBagGroups();
  const { remove, lines } = useCart();

  return (
    <StoreLayout>
      <UiAttributes>
        <PageTitle
          eyebrow={`${groups.length} shop${groups.length === 1 ? "" : "s"}`}
          title="Your bag"
        >
          <div className="mt-5 max-w-lg">
            <CheckoutProgress current="bag" />
          </div>
        </PageTitle>
      </UiAttributes>
      <div className="cart-page-content mx-auto max-w-7xl px-4 pb-24 lg:pb-0">
        <BagIssues issues={issues} />
        <CartRecovery />
        {Object.values(lines)
          .filter(
            (line) =>
              !groups.some((g) =>
                g.items.some(
                  (item) => item.product.id === line.productId && item.variantId === line.variantId,
                ),
              ),
          )
          .map((line) => (
            <Button
              key={`${line.productId}-${line.variantId}`}
              variant="outline"
              className="mb-4"
              onClick={() => remove(line.productId, line.variantId)}
            >
              Remove unavailable item ({line.productId})
            </Button>
          ))}
        {groups.length === 0 ? (
          <UiAttributes>
            <EmptyState
              title="Your bag is empty"
              body="Browse the shops near you and add a few things."
              action={
                <Button asChild>
                  <Link to="/">Start shopping</Link>
                </Button>
              }
            />
          </UiAttributes>
        ) : (
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-8">
              <div className="border border-primary/20 bg-secondary/50 p-4 text-sm">
                <p className="font-medium">
                  One bag, {groups.length} local shop
                  <UiText>{groups.length === 1 ? "" : "s"}</UiText>
                </p>
                <p className="mt-1 text-muted-foreground">
                  Each shop accepts, packs and delivers its own part. They may arrive separately.
                </p>
              </div>
              <UiAttributes>
                <nav
                  aria-label="Shop totals in your bag"
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <h2 className="font-display text-xl">Your shop totals</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimated totals including delivery. Tap a shop to review its items.
                  </p>
                  <ul className="mt-3 divide-y divide-border">
                    {groups.map((g) => (
                      <li key={g.shop.id}>
                        <a
                          href={`#bag-shop-${g.shop.id}`}
                          className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm hover:text-primary"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium">{g.shop.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {g.items.reduce((n, item) => n + item.qty, 0)} items · Delivery{" "}
                              <UiText>{g.deliveryFee ? inr(g.deliveryFee) : "Free"}</UiText>
                              <UiText>{!g.shop.isOpen ? " · Closed" : ""}</UiText>
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {inr(g.itemsTotal + g.deliveryFee)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </UiAttributes>
              {groups.map((g) => (
                <UiAttributes key={g.shop.id}>
                  <section
                    key={g.shop.id}
                    id={`bag-shop-${g.shop.id}`}
                    aria-label={`${g.shop.name} items and totals`}
                    className="cart-shop-panel scroll-mt-48 border border-border bg-card"
                  >
                    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                      <ShopInitials shop={g.shop} className="size-9 text-sm" />
                      <Link
                        to="/shop/$slug"
                        params={{ slug: g.shop.slug }}
                        className="font-display text-lg hover:underline"
                      >
                        {g.shop.name}
                      </Link>
                      <span className="label-stamp ml-auto text-muted-foreground">
                        {fulfilmentLabel[g.fulfilment]}
                      </span>
                    </header>
                    {!g.shop.isOpen && (
                      <p className="bg-warning/10 px-4 py-2 text-sm">
                        Closed now: remove these items or wait until the shop reopens to check out.
                        Hours: {g.shop.hours}.
                      </p>
                    )}
                    <ul className="divide-y divide-border">
                      {g.items.map(({ product, variantId, variantLabel, unitPrice, qty }) => (
                        <li
                          key={`${product.id}-${variantId ?? "base"}`}
                          className="cart-line-item flex flex-wrap gap-3 p-4 sm:flex-nowrap"
                        >
                          <ProductImage
                            src={product.image}
                            alt={product.name}
                            width={160}
                            className="size-20 shrink-0 rounded-sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {variantLabel ?? product.unit} · {inr(unitPrice)} each
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <div className="w-28">
                                <AddToBag product={product} variantId={variantId} />
                              </div>
                              <UiAttributes>
                                <button
                                  onClick={() => remove(product.id, variantId)}
                                  className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted-foreground hover:text-destructive"
                                  aria-label={`Remove ${product.name}`}
                                >
                                  <Trash2 className="size-4" />
                                  <UiText>{"Remove"}</UiText>
                                </button>
                              </UiAttributes>
                            </div>
                          </div>
                          <p className="font-semibold tabular-nums">{inr(unitPrice * qty)}</p>
                        </li>
                      ))}
                    </ul>
                    <ShopCheckoutDetails group={g} />
                    <footer className="flex flex-wrap justify-between gap-y-2 border-t border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                      <span>Final availability and charges are confirmed at checkout.</span>
                    </footer>
                  </section>
                </UiAttributes>
              ))}
            </div>
            <aside className="lg:col-span-4">
              <div className="order-summary-panel sticky top-40 border border-border bg-card p-6">
                <h2 className="font-display text-2xl">Summary</h2>
                <div className="mt-4">
                  <Totals
                    itemsTotal={itemsTotal}
                    delivery={delivery}
                    savings={savings}
                    total={total}
                  />
                </div>
                <Button
                  asChild={canCheckout}
                  disabled={!canCheckout}
                  variant="citrus"
                  size="lg"
                  className="mt-6 w-full"
                >
                  {canCheckout ? (
                    <Link to="/checkout">Continue to checkout</Link>
                  ) : (
                    <span>Resolve bag issues to continue</span>
                  )}
                </Button>
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-4 text-success" /> No payment is taken until you
                  place your order.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
      {groups.length > 0 && (
        <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-1">
            <div className="min-w-0 flex-1">
              <p className="label-stamp text-muted-foreground">Estimated total</p>
              <p className="font-semibold tabular-nums">{inr(total)}</p>
              <a href="#main" className="text-xs text-primary underline">
                {groups.length} shop<UiText>{groups.length === 1 ? "" : "s"}</UiText> · Review
                totals
              </a>
            </div>
            {canCheckout ? (
              <Button asChild variant="citrus">
                <Link to="/checkout">
                  <UiText>{"Checkout "}</UiText>
                  <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button disabled>Review bag issues</Button>
            )}
          </div>
        </div>
      )}
    </StoreLayout>
  );
}
