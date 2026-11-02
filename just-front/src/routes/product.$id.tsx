import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useLocationArea } from "@/stores/location";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Heart } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductImage } from "@/components/store/ProductImage";
import { Price, ProductCard } from "@/components/store/ProductCard";
import { AddToBag } from "@/components/store/QtyStepper";
import { FulfilmentChips, OpenState, ShopInitials } from "@/components/store/ShopMark";
import { Button } from "@/components/ui/button";
import { categoriesQuery, productQuery, productsQuery, shopById } from "@/services/catalog";
import { useCart } from "@/stores/cart";
import { cn } from "@/lib/utils";
import { VariantPicker } from "@/components/store/VariantPicker";
import { MobileProductPurchase } from "@/components/store/MobileProductPurchase";
import { validOffer } from "@/lib/offers";
import { isDemoMode } from "@/lib/config";

export const Route = createFileRoute("/product/$id")({
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(productQuery(params.id));
    if (!p) throw notFound();
    return { name: p.name, description: p.description };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Product"}: Just Pack It` },
      { name: "description", content: loaderData?.description ?? "Product from a local shop." },
      { property: "og:title", content: loaderData?.name ?? "Product" },
      {
        property: "og:description",
        content: loaderData?.description ?? "Available on Just Pack It.",
      },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: p } = useSuspenseQuery(productQuery(id));
  const { area, gps } = useLocationArea();
  const { data: related = [] } = useQuery({
    ...productsQuery({ category: p!.categorySlug, area: area?.id, ...gps }),
    enabled: !!area,
  });
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { wishlist, toggleWish } = useCart();
  const [selection, setSelection] = useState<{ productId: string; variantId: string }>();
  const selectedVariantId = selection?.productId === id ? selection.variantId : undefined;
  if (!p) return null;
  const shop = shopById(p.shopId)!;
  const wished = wishlist.includes(p.id);
  const selectedVariant = p.variants?.find((variant) => variant.id === selectedVariantId);
  const displayedPrice = selectedVariant?.price ?? p.price;
  const displayedStock = selectedVariant?.stock ?? p.stock;

  return (
    <StoreLayout>
      <div className="product-detail-layout mx-auto grid max-w-7xl gap-10 px-4 pt-8 md:grid-cols-2 md:gap-16">
        <div className="product-detail-photo relative rounded-sm bg-paper">
          <ProductImage src={p.image} alt={p.name} width={900} eager />
          {validOffer(p.offer) && (
            <span className="label-stamp absolute left-3 top-3 bg-promo px-2 py-1 text-promo-foreground">
              <UiText>{p.offer.label}</UiText>
            </span>
          )}
        </div>
        <div className="product-detail-info flex flex-col">
          <UiAttributes>
            <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
              <Link to="/" className="hover:underline">
                <UiText>{"Home"}</UiText>
              </Link>{" "}
              /{" "}
              <Link
                to="/category/$slug"
                params={{ slug: p.categorySlug }}
                className="hover:underline"
              >
                {categories.find((category) => category.slug === p.categorySlug)?.name ??
                  p.categorySlug}
              </Link>
            </nav>
          </UiAttributes>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">{p.name}</h1>
          <p className="mt-1 text-muted-foreground">{selectedVariant?.label ?? p.unit}</p>
          <div aria-live="polite" aria-atomic="true">
            <Price
              price={displayedPrice}
              mrp={selectedVariant ? undefined : p.mrp}
              className="mt-6 text-2xl"
            />
            {validOffer(p.offer) && (
              <p className="mt-1 text-sm text-promo">
                <UiText>{p.offer.label}</UiText> · valid till{" "}
                {new Date(p.offer.validUntil).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            )}
            <p
              className={cn(
                "mt-4 text-sm font-medium",
                displayedStock <= 0
                  ? "text-destructive"
                  : displayedStock <= 5
                    ? "text-promo"
                    : "text-success",
              )}
            >
              {p.variants?.length && !selectedVariant
                ? "Choose an option to see availability"
                : displayedStock <= 0
                  ? "Out of stock at this shop"
                  : displayedStock <= 5
                    ? `Only ${displayedStock} left`
                    : "In stock"}
            </p>
            {selectedVariant && (
              <p className="mt-2 text-sm text-muted-foreground">
                Selected: <UiText>{selectedVariant.label}</UiText>
                {selectedVariant.attributes?.map((a) => ` · ${a.label}: ${a.value}`).join("")}
              </p>
            )}
          </div>
          <div id="product-options" className="scroll-mt-48">
            {p.variants?.length ? (
              <VariantPicker
                variants={p.variants}
                selectedId={selectedVariant?.id}
                onSelect={(variantId) => setSelection({ productId: p.id, variantId })}
              />
            ) : null}
          </div>
          <div className="product-detail-purchase mt-6 flex gap-3">
            <div className="hidden flex-1 md:block">
              <AddToBag product={p} variantId={selectedVariantId} size="lg" />
            </div>
            <UiAttributes>
              <Button
                variant="outline"
                size="lg"
                onClick={() => toggleWish(p.id)}
                disabled={!isDemoMode}
                title={!isDemoMode ? "Wishlist is not available yet" : undefined}
                aria-pressed={wished}
                aria-label="Save to wishlist"
              >
                <Heart className={cn(wished && "fill-promo text-promo")} />
              </Button>
            </UiAttributes>
          </div>
          <p className="mt-8 leading-relaxed">{p.description}</p>
          {p.attributes?.length ? (
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-border bg-border text-sm">
              {p.attributes.map((attribute) => (
                <div key={attribute.label} className="bg-card p-3">
                  <dt className="label-stamp text-muted-foreground">
                    <UiText>{attribute.label}</UiText>
                  </dt>
                  <dd className="mt-1 font-medium">{attribute.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="product-merchant-panel mt-8 border-t border-border pt-6">
            <p className="label-stamp text-muted-foreground">Sold and packed by</p>
            <Link
              to="/shop/$slug"
              params={{ slug: shop.slug }}
              className="mt-3 flex items-center gap-4 hover:opacity-80"
            >
              <ShopInitials shop={shop} />
              <div>
                <p className="font-display text-xl">{shop.name}</p>
                <OpenState shop={shop} />
              </div>
            </Link>
            <div className="mt-4">
              <FulfilmentChips methods={shop.fulfilment} />
            </div>
          </div>
        </div>
      </div>
      <section className="related-products mx-auto mt-20 max-w-7xl px-4">
        <h2 className="border-b border-foreground pb-2 font-display text-2xl">
          More in this aisle
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
          {related
            .filter((r) => r.id !== p.id)
            .slice(0, 4)
            .map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
        </div>
      </section>
      <MobileProductPurchase product={p} variant={selectedVariant} />
    </StoreLayout>
  );
}
