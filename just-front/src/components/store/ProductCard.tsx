import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { Product } from "@/domain/types";
import { shopById } from "@/services/catalog";
import { inr } from "@/lib/image";
import { useCart } from "@/stores/cart";
import { cn } from "@/lib/utils";
import { ProductImage } from "./ProductImage";
import { AddToBag } from "./QtyStepper";
import { validOffer } from "@/lib/offers";
import { isDemoMode } from "@/lib/config";

export function Price({
  price,
  mrp,
  className,
}: {
  price: number;
  mrp?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="font-semibold tabular-nums">{inr(price)}</span>
      {mrp && mrp > price && (
        <>
          <span className="text-xs text-muted-foreground line-through tabular-nums">
            MRP {inr(mrp)}
          </span>
        </>
      )}
    </div>
  );
}

export function ProductCard({
  product,
  variant = "grid",
  wishlistEnabled = isDemoMode,
}: {
  product: Product;
  variant?: "grid" | "row";
  wishlistEnabled?: boolean;
}) {
  const shop = shopById(product.shopId);
  const { wishlist, toggleWish } = useCart();
  const wished = wishlist.includes(product.id);
  const low = product.stock > 0 && product.stock <= 5;

  if (variant === "row") {
    return (
      <article className="product-row flex">
        <Link to="/product/$id" params={{ id: product.id }} className="product-row-photo shrink-0">
          <ProductImage src={product.image} alt={product.name} width={200} className="rounded-sm" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            to="/product/$id"
            params={{ id: product.id }}
            className="line-clamp-2 font-medium hover:underline"
          >
            {product.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {product.unit} · {shop?.name}
          </span>
          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <Price price={product.price} mrp={product.mrp} />
            <div className="product-row-action">
              <AddToBag product={product} />
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("product-card group flex flex-col", product.stock <= 0 && "opacity-70")}>
      <div className="product-card-photo relative overflow-hidden rounded-sm bg-paper">
        <UiAttributes>
          <Link to="/product/$id" params={{ id: product.id }} aria-label={product.name}>
            <ProductImage
              src={product.image}
              alt={product.name}
              className="transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </Link>
        </UiAttributes>
        {validOffer(product.offer) && (
          <span className="label-stamp absolute left-2 top-2 rounded-sm bg-promo px-1.5 py-1 text-promo-foreground">
            <UiText>{product.offer.label}</UiText>
          </span>
        )}
        <UiAttributes>
          <button
            disabled={!wishlistEnabled}
            title={!wishlistEnabled ? "Wishlist is not available yet" : undefined}
            onClick={() => toggleWish(product.id)}
            aria-label={
              wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`
            }
            aria-pressed={wished}
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground hover:bg-card"
          >
            <Heart className={cn("size-4", wished && "fill-promo text-promo")} />
          </button>
        </UiAttributes>
      </div>
      <div className="product-card-body flex flex-1 flex-col">
        {shop && (
          <Link
            to="/shop/$slug"
            params={{ slug: shop.slug }}
            className="text-caption truncate text-muted-foreground hover:text-primary hover:underline"
          >
            {shop.name}
          </Link>
        )}
        <Link
          to="/product/$id"
          params={{ id: product.id }}
          className="product-card-name mt-1 line-clamp-2 text-sm font-medium leading-snug hover:underline"
        >
          {product.name}
        </Link>
        <span className="mt-0.5 text-xs text-muted-foreground">{product.unit}</span>
        <div className="product-card-price mt-2 flex flex-wrap items-center justify-between gap-2">
          <Price price={product.price} mrp={product.mrp} />
          {low && <span className="text-xs font-medium text-promo">Only {product.stock} left</span>}
        </div>
        <div className="product-card-action">
          {product.variants?.length ? (
            <Link to="/product/$id" params={{ id: product.id }} className="product-option-link">
              Choose options
            </Link>
          ) : (
            <AddToBag product={product} />
          )}
        </div>
      </div>
    </article>
  );
}
