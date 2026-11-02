import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { productQuery } from "@/services/catalog";
import { useCart } from "@/stores/cart";
import { ProductCard } from "./ProductCard";
import { Button } from "@/components/ui/button";
export function ConnectedWishlist() {
  const { wishlist, toggleWish } = useCart();
  const [limit, setLimit] = useState(12);
  const ids = wishlist.slice(0, limit);
  const queries = useQueries({
    queries: ids.map((id) => ({ ...productQuery(id), retry: false, staleTime: 15000 })),
  });
  return (
    <UiAttributes>
      <section className="space-y-5" aria-label="Saved products">
        <div>
          <h2 className="font-display text-2xl">
            <UiText>{"Your wishlist"}</UiText>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Saved for the current account or guest in this browser, not synced to other devices.
            Saving does not reserve stock or lock a price. Check your delivery area before checkout.
          </p>
          <p role="status" className="mt-2 text-sm">
            {wishlist.length} saved{" "}
            <UiText>{wishlist.length === 1 ? "product" : "products"}</UiText>
          </p>
        </div>
        {!wishlist.length ? (
          <div className="rounded-xl border p-5">
            <p>No saved products yet. Tap a product’s heart to keep it here.</p>
            <Button asChild variant="outline" className="mt-3">
              <Link to="/categories">
                <UiText>{"Explore categories"}</UiText>
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ids.map((id, index) => {
              const query = queries[index];
              return (
                <li key={id} className="min-w-0">
                  {query.isPending ? (
                    <div role="status" className="rounded-xl border p-5">
                      Loading saved product…
                    </div>
                  ) : query.isError ? (
                    <div className="space-y-3 rounded-xl border p-5">
                      <p role="alert">
                        Could not load this saved product. It has not been removed.
                      </p>
                      <Button variant="outline" onClick={() => void query.refetch()}>
                        Retry saved product
                      </Button>
                      <Button variant="ghost" onClick={() => toggleWish(id)}>
                        <UiText>{"Remove saved item"}</UiText>
                      </Button>
                    </div>
                  ) : query.data ? (
                    <ProductCard product={query.data} wishlistEnabled />
                  ) : (
                    <div className="space-y-3 rounded-xl border p-5">
                      <h3 className="font-medium">Product unavailable</h3>
                      <p className="text-sm text-muted-foreground">
                        This listing or its shop is no longer available. You can remove it from your
                        wishlist.
                      </p>
                      <Button variant="outline" onClick={() => toggleWish(id)}>
                        Remove unavailable item
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {wishlist.length > limit && (
          <Button variant="outline" onClick={() => setLimit((value) => value + 12)}>
            Load more saved products
          </Button>
        )}
      </section>
    </UiAttributes>
  );
}
