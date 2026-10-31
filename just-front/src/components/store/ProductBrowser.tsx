import { CatalogueMore } from "./CatalogueMore";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  productPagesQuery,
  categoriesQuery,
  type ProductQuery,
  type SortKey,
} from "@/services/catalog";
import { ProductCard } from "./ProductCard";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLocationArea } from "@/stores/location";
import { Link } from "@tanstack/react-router";
import { useAreaShops } from "./useAreaShops";

/** Filter bar + results grid used by search, category and shop pages. */
export function ProductBrowser({
  query,
  onChange,
  emptyHint,
}: {
  query: ProductQuery;
  onChange: (q: Partial<ProductQuery>) => void;
  emptyHint?: string;
}) {
  const { area, gps } = useLocationArea();
  const pages = useInfiniteQuery({
    ...productPagesQuery({ ...query, area: area?.id, ...gps }),
    enabled: !!area,
  });
  const data = [
    ...new Map(
      (pages.data?.pages.flatMap((page) => page.items) ?? []).map((product) => [
        product.id,
        product,
      ]),
    ).values(),
  ];
  const { isPending, refetch } = pages;
  const isError = pages.isError && !pages.data;
  const { data: categories = [] } = useQuery(categoriesQuery());
  const shops = useAreaShops();
  if (!area)
    return (
      <EmptyState
        title="Choose your area first"
        body="Select your neighbourhood above to search products from shops serving it."
      />
    );
  return (
    <div className="product-browser">
      {query.q && (
        <p className="mb-3 text-sm text-muted-foreground">
          Results may include close spellings. Your selected area and filters still apply.
        </p>
      )}
      <div className="catalogue-toolbar flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-3">
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="sr-only">Category filter</span>
          <select
            className="h-11 max-w-56 rounded-lg border border-input bg-card px-3"
            value={query.category ?? ""}
            onChange={(event) => onChange({ category: event.target.value || undefined })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <SlidersHorizontal className="size-4" />
          {isPending
            ? "Searching…"
            : `${data.length} loaded${pages.data?.pages[0]?.total !== undefined ? ` of ${pages.data.pages[0].total}` : ""} items`}
        </p>
        <div className="flex items-center gap-2">
          <Switch
            id="instock"
            checked={!!query.inStockOnly}
            onCheckedChange={(v) => onChange({ inStockOnly: v || undefined })}
          />
          <Label htmlFor="instock" className="text-sm">
            In stock
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="offers"
            checked={!!query.offersOnly}
            onCheckedChange={(v) => onChange({ offersOnly: v || undefined })}
          />
          <Label htmlFor="offers" className="text-sm">
            Offers
          </Label>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={query.sort ?? "relevance"}
            onChange={(e) => onChange({ sort: e.target.value as SortKey })}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      <div className="mt-8">
        {isPending ? (
          <GridSkeleton />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : data.length === 0 ? (
          <>
            <EmptyState
              title="Nothing matched"
              body={emptyHint ?? "Try a simpler word, or switch off filters."}
              action={
                <Button
                  variant="outline"
                  onClick={() =>
                    onChange({
                      inStockOnly: undefined,
                      offersOnly: undefined,
                      q: undefined,
                      category: undefined,
                    })
                  }
                >
                  Clear filters
                </Button>
              }
            />
            <section
              className="mt-6 rounded-xl border border-border bg-card p-4"
              aria-label="Explore alternatives"
            >
              <h2 className="font-display text-xl">Try a local shop or another category</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These are alternatives in your selected area.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {shops.slice(0, 3).map((shop) => (
                  <Link
                    key={shop.id}
                    to="/shop/$slug"
                    params={{ slug: shop.slug }}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-primary"
                  >
                    {shop.name}
                  </Link>
                ))}
                {categories
                  .filter((c) => shops.some((s) => s.categories.includes(c.slug)))
                  .slice(0, 3)
                  .map((category) => (
                    <Link
                      key={category.slug}
                      to="/category/$slug"
                      params={{ slug: category.slug }}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      {category.name}
                    </Link>
                  ))}
              </div>
            </section>
          </>
        ) : (
          <div className="catalogue-product-grid grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {data.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
      <CatalogueMore
        hasMore={!!pages.hasNextPage}
        busy={pages.isFetching}
        error={pages.isFetchNextPageError}
        onMore={() => void pages.fetchNextPage()}
      />
    </div>
  );
}
