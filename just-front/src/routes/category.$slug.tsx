import { CatalogueMore } from "@/components/store/CatalogueMore";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search, ArrowRight, MapPin, Store, ChevronRight } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { EmptyState } from "@/components/common/states";
import { FulfilmentChips, OpenState, ShopInitials, ShopCover } from "@/components/store/ShopMark";
import { CategoryArtwork } from "@/components/store/CategoryArtwork";
import "@/styles/category-market.css";
import { categoriesQuery } from "@/services/catalog";
import { useLocationArea } from "@/stores/location";
import { useAreaShopPages } from "@/components/store/useAreaShops";
import { listedDeliveryFee, shopSearchSchema, type ShopSearch } from "@/lib/shop-discovery";
import { Button } from "@/components/ui/button";
import { validOffer } from "@/lib/offers";

export const Route = createFileRoute("/category/$slug")({
  validateSearch: shopSearchSchema,
  loader: async ({ context, params }) => {
    const categories = await context.queryClient.ensureQueryData(categoriesQuery());
    const category = categories.find((c) => c.slug === params.slug);
    if (!category) throw notFound();
    return { category };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.category.name ?? "Category"}: Just Pack It` },
      {
        name: "description",
        content: `Shop ${loaderData?.category.name ?? "products"} from local stores near you.`,
      },
      {
        property: "og:title",
        content: `${loaderData?.category.name ?? "Category"}: Just Pack It`,
      },
      {
        property: "og:description",
        content: loaderData?.category.blurb ?? "Local shops, delivered.",
      },
    ],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/category/$slug" });
  const shopPages = useAreaShopPages({ category: category.slug, ...search });
  const { area } = useLocationArea();
  const eligible = shopPages.shops;
  const total = shopPages.total;
  const hasFilters = !!(search.q || search.openOnly || search.fulfilment || search.sort === "open");
  const reset = () => navigate({ search: {} });
  return (
    <StoreLayout>
      <section className="category-page-hero market-category-hero mx-auto grid max-w-7xl items-end gap-6 px-4 pb-8 pt-10 md:grid-cols-12">
        <div className="md:col-span-8">
          <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link to="/" className="hover:underline">
              Home
            </Link>{" "}
            <ChevronRight size={12} aria-hidden="true" />
            <Link to="/categories" className="hover:underline">
              Categories
            </Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span aria-current="page">{category.name}</span>
          </nav>
          <p className="market-category-eyebrow mt-6">
            <Store size={16} aria-hidden="true" /> Your next favourite counter
          </p>
          <h1 className="mt-2 font-display text-5xl md:text-6xl">{category.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {category.blurb} Browse each shop's own catalogue, stock and offers.
          </p>
          <span className="market-category-area">
            <MapPin size={15} aria-hidden="true" />
            {area ? `Shops serving ${area.name}` : "Set your area to discover nearby shops"}
          </span>
          {category.subcategories?.length ? (
            <div
              className="market-category-topics mt-5 flex flex-wrap gap-2"
              aria-label="Product types in this category"
            >
              {category.subcategories.map((sub) => (
                <span
                  key={sub.slug}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                >
                  {sub.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="market-category-art md:col-span-4">
          <CategoryArtwork category={category} width={500} className="market-category-photo" />
          <span className="market-category-art-caption">A whole lane of possibilities.</span>
        </div>
      </section>
      <div className="category-page-content market-category-content mx-auto max-w-7xl px-4 py-8">
        <div className="market-category-list-heading">
          <div>
            <p className="market-category-eyebrow">Independent shops. Individual catalogues.</p>
            <h2>Find your local favourite.</h2>
          </div>
          <Link to="/categories">
            Explore other lanes <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="catalogue-toolbar flex flex-wrap items-center gap-3 border-y border-border py-3">
          <label className="relative min-w-0 basis-64 flex-1">
            <span className="sr-only">Search shops in {category.name}</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search.q ?? ""}
              onChange={(event) =>
                navigate({
                  search: (current) => ({ ...current, q: event.target.value || undefined }),
                })
              }
              placeholder={`Search ${category.name} shops`}
              className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select
              aria-label="Sort shops"
              value={search.sort === "open" ? "recommended" : (search.sort ?? "recommended")}
              onChange={(event) =>
                navigate({
                  search: (current) => ({
                    ...current,
                    sort: event.target.value as ShopSearch["sort"],
                    openOnly: current.sort === "open" ? true : current.openOnly,
                  }),
                })
              }
              className="h-11 max-w-full rounded-lg border border-input bg-card px-2"
            >
              <option value="recommended">Recommended</option>
              <option value="name">Name A to Z</option>
              <option value="fee_asc">Delivery fee: low to high</option>
              <option value="fee_desc">Delivery fee: high to low</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!search.openOnly || search.sort === "open"}
              onChange={(event) =>
                navigate({
                  search: (current) => ({
                    ...current,
                    openOnly: event.target.checked || undefined,
                    sort: current.sort === "open" ? undefined : current.sort,
                  }),
                })
              }
              className="size-4 accent-primary"
            />
            Open now
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span>Get your order</span>
            <select
              aria-label="Pickup or delivery"
              value={search.fulfilment ?? ""}
              onChange={(event) =>
                navigate({
                  search: (current) => ({
                    ...current,
                    fulfilment: (event.target.value || undefined) as ShopSearch["fulfilment"],
                  }),
                })
              }
              className="h-11 max-w-full rounded-lg border border-input bg-card px-2"
            >
              <option value="">All options</option>
              <option value="pickup">Store pickup</option>
              <option value="delivery">Any delivery</option>
              <option value="seller_delivery">Shop delivers</option>
              <option value="platform_delivery">Just Pack It rider</option>
            </select>
          </label>
          {(hasFilters || (search.sort && search.sort !== "recommended")) && (
            <Button variant="ghost" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground" role="status" aria-live="polite">
          {eligible.length} loaded{total !== undefined ? ` of ${total} matching` : ""} shops
          {area ? ` serving ${area.name}` : ": choose an area to see availability"}
        </p>
        {search.sort?.startsWith("fee_") && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sorted by listed delivery fee, not product prices. Shops without a listed fee appear
            last. Final charges depend on your address and delivery method.
          </p>
        )}
        {area && shopPages.isPending ? (
          <p role="status">Loading category shops…</p>
        ) : area && shopPages.isError && !eligible.length ? (
          <div role="alert">
            Could not load shops.{" "}
            <Button variant="outline" onClick={() => void shopPages.refetch()}>
              Retry shops
            </Button>
          </div>
        ) : eligible.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title={
                area ? `No ${category.name} shops match in this area` : "Choose your area first"
              }
              body={
                !area
                  ? "Use the area selector above to discover shops in your neighbourhood."
                  : hasFilters
                    ? "Try another search or clear the filters to see all shops in this category."
                    : "Try another category, area or shop filter."
              }
              action={
                area && hasFilters ? (
                  <Button variant="outline" onClick={reset}>
                    Clear filters
                  </Button>
                ) : (
                  <Link
                    to="/search"
                    className="rounded-md border border-border px-4 py-2 text-sm hover:border-primary"
                  >
                    Browse all products
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <ul className="category-shop-grid mt-6 grid gap-4 md:grid-cols-2">
            {eligible.map((shop) => (
              <li key={shop.id}>
                <Link
                  to="/shop/$slug"
                  params={{ slug: shop.slug }}
                  className="category-shop-card block h-full border border-border bg-card transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lift"
                >
                  <ShopCover shop={shop} />
                  <div className="category-shop-body flex gap-4">
                    <ShopInitials shop={shop} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-display text-2xl">{shop.name}</h2>
                        <OpenState shop={shop} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {shop.tagline}
                      </p>
                      <p className="market-category-shop-locality mt-3 text-xs text-muted-foreground">
                        <MapPin size={13} aria-hidden="true" />
                        {shop.locality}
                        {shop.since ? ` · Since ${shop.since}` : ""}
                      </p>
                      <div className="mt-4">
                        {validOffer(shop.offer) && (
                          <p className="mb-2 text-sm font-medium text-primary">
                            {shop.offer.label} · Shop-specific offer
                          </p>
                        )}
                        <FulfilmentChips methods={shop.fulfilment} />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {listedDeliveryFee(shop) !== undefined
                          ? `Delivery from ₹${listedDeliveryFee(shop)}`
                          : shop.fulfilment.some((m) => m !== "pickup")
                            ? "Delivery fee not listed"
                            : "Pickup only"}
                      </p>
                    </div>
                  </div>
                  <div className="market-category-shop-action">
                    <span>Browse this shop</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {area && (
        <CatalogueMore
          label="shops"
          hasMore={!!shopPages.hasNextPage}
          busy={shopPages.isFetching}
          error={shopPages.isFetchNextPageError}
          onMore={() => void shopPages.fetchNextPage()}
        />
      )}
    </StoreLayout>
  );
}
