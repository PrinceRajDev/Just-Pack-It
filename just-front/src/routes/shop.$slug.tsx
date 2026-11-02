import { LoadingState } from "@/components/common/LoadingState";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { CatalogueMore } from "@/components/store/CatalogueMore";
import { Button } from "@/components/ui/button";
import { useLocationArea } from "@/stores/location";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { FulfilmentChips, OpenState, ShopInitials, ShopCover } from "@/components/store/ShopMark";
import { EmptyState } from "@/components/common/states";
import { categoriesQuery, productPagesQuery, shopQuery } from "@/services/catalog";
import { ShopOffer } from "@/components/store/ShopOffer";

export const Route = createFileRoute("/shop/$slug")({
  loader: async ({ context, params }) => {
    const shop = await context.queryClient.ensureQueryData(shopQuery(params.slug));
    if (!shop) throw notFound();
    return { name: shop.name, tagline: shop.tagline };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Shop"}: Just Pack It` },
      { name: "description", content: loaderData?.tagline ?? "A local shop on Just Pack It." },
      { property: "og:title", content: `${loaderData?.name ?? "Shop"} on Just Pack It` },
      {
        property: "og:description",
        content: loaderData?.tagline ?? "Order from this neighbourhood shop.",
      },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { slug } = Route.useParams();
  const { data: shop } = useSuspenseQuery(shopQuery(slug));
  const { area, gps } = useLocationArea();
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const [q, setQ] = useState("");
  const pages = useInfiniteQuery(
    productPagesQuery({ shop: shop!.id, area: area?.id, ...gps, q: q.trim() || undefined }),
  );
  const filtered = useMemo(
    () => [
      ...new Map(
        (pages.data?.pages.flatMap((page) => page.items) ?? []).map((product) => [
          product.id,
          product,
        ]),
      ).values(),
    ],
    [pages.data],
  );
  const groups = categories
    .map((c) => ({ c, items: filtered.filter((p) => p.categorySlug === c.slug) }))
    .filter((g) => g.items.length);
  if (!shop) return null;

  return (
    <StoreLayout>
      <section className="shop-page-hero border-b border-border paper-grain">
        <ShopCover shop={shop} className="shop-page-cover" />
        <div className="shop-page-identity mx-auto max-w-7xl px-4 py-12">
          <UiAttributes>
            <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
              <Link to="/" className="hover:underline">
                <UiText>{"Home"}</UiText>
              </Link>{" "}
              / Shops / {shop.name}
            </nav>
          </UiAttributes>
          <div className="shop-page-summary mt-5 flex flex-col gap-4 md:flex-row md:items-start">
            <ShopInitials shop={shop} className="size-20 text-3xl" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-4xl md:text-6xl">{shop.name}</h1>
              <p className="mt-2 text-muted-foreground">
                {[shop.tagline, shop.locality, shop.since ? `since ${shop.since}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {shop.description && (
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{shop.description}</p>
              )}
              {shop.address && <p className="mt-2 text-sm text-muted-foreground">{shop.address}</p>}
              <ShopOffer shop={shop} />
              <div className="mt-4 flex flex-wrap gap-2">
                {shop.categories.map((slug) => (
                  <Link
                    key={slug}
                    to="/category/$slug"
                    params={{ slug }}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs hover:border-primary"
                  >
                    {categories.find((category) => category.slug === slug)?.name ?? slug}
                  </Link>
                ))}
              </div>
              <div className="mt-3">
                <OpenState shop={shop} />
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <FulfilmentChips methods={shop.fulfilment} />
          </div>
        </div>
      </section>
      {!shop.isOpen && (
        <div className="border-b border-warning/40 bg-warning/10 px-4 py-3 text-center text-sm">
          This shop is closed right now. You can browse, but items from this shop can't be checked
          out until it opens ({shop.hours}).
        </div>
      )}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-8 gap-y-2 px-4 py-3 text-sm text-muted-foreground">
          <span>
            <UiText>
              {shop.fulfilment.includes("pickup")
                ? (shop.pickupNote ?? "Pickup available at the shop")
                : "Pickup is not available"}
            </UiText>
          </span>
          {shop.deliveryFee !== undefined && <span>Rider delivery from ₹{shop.deliveryFee}</span>}
          <span>Each listing has this shop’s own price and stock.</span>
        </div>
      </div>
      <div className="shop-catalogue-layout mx-auto grid max-w-7xl gap-10 px-4 pt-10 md:grid-cols-12">
        <aside className="shop-catalogue-sidebar md:col-span-3">
          <div className="sticky top-40 space-y-4">
            <label className="relative block">
              <span className="sr-only">Search in {shop.name}</span>
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <UiAttributes>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search in ${shop.name}`}
                  className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm"
                />
              </UiAttributes>
            </label>
            <UiAttributes>
              <nav aria-label="Shop sections" className="hidden md:block">
                <ul className="space-y-1 text-sm">
                  {groups.map((g) => (
                    <li key={g.c.slug}>
                      <a href={`#sec-${g.c.slug}`} className="hover:text-primary">
                        {g.c.name}{" "}
                        <span className="text-muted-foreground">({g.items.length} loaded)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </UiAttributes>
          </div>
        </aside>
        <div className="md:col-span-9">
          {pages.isPending ? (
            <LoadingState label="Loading shop products…" compact />
          ) : pages.isError && !pages.data ? (
            <div role="alert">
              Could not load shop products.{" "}
              <Button variant="outline" onClick={() => void pages.refetch()}>
                Retry products
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <UiAttributes>
              <EmptyState title="No products match" body="Try a different word." />
            </UiAttributes>
          ) : (
            groups.map((g) => (
              <section key={g.c.slug} id={`sec-${g.c.slug}`} className="mb-14 scroll-mt-40">
                <h2 className="catalogue-section-heading border-b border-foreground pb-2 font-display text-2xl">
                  {g.c.name}
                </h2>
                <div className="catalogue-product-grid mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3">
                  {g.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            ))
          )}
          <CatalogueMore
            hasMore={!!pages.hasNextPage}
            busy={pages.isFetching}
            error={pages.isFetchNextPageError}
            onMore={() => void pages.fetchNextPage()}
          />
        </div>
      </div>
    </StoreLayout>
  );
}
