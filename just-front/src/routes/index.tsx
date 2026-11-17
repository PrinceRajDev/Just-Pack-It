import "@/styles/home-premium.css";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { CatalogueMore } from "@/components/store/CatalogueMore";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Grid2X2, MapPin } from "lucide-react";
import { imageUrl } from "@/lib/image";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { ProductImage } from "@/components/store/ProductImage";
import { CategoryArtwork } from "@/components/store/CategoryArtwork";
import { FulfilmentChips, OpenState, ShopInitials } from "@/components/store/ShopMark";
import { categoriesQuery, productsQuery } from "@/services/catalog";
import { useLocationArea } from "@/stores/location";
import { useAreaShopPages } from "@/components/store/useAreaShops";
import { isDemoMode } from "@/lib/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Just Pack It: Your neighbourhood market" },
      {
        name: "description",
        content:
          "Discover neighbourhood shops for food, fashion, daily essentials and more. Browse local catalogues and order delivery to your door.",
      },
      { property: "og:title", content: "Just Pack It: Your neighbourhood, packed and delivered" },
      {
        property: "og:description",
        content: "Shop local kiranas, sabziwalas, dairies and bakeries online.",
      },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(categoriesQuery())]),
  component: Home,
});

function Home() {
  const { area, gps } = useLocationArea();
  const previews = useQuery({ ...productsQuery({ area: area?.id, ...gps }), enabled: !!area });
  const allProducts = previews.data ?? [];
  const shopPages = useAreaShopPages();
  const shops = shopPages.shops;
  const products = allProducts;
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const fresh = products.filter((p) => p.tags?.includes("fresh") || p.tags?.includes("new"));
  const essentials = products.filter((p) => p.tags?.includes("essential"));
  const bestsellers = products.filter((p) => p.tags?.includes("bestseller"));
  const visibleCategories = categories.slice(0, 6);

  return (
    <StoreLayout>
      <div className="marketplace-home">
        <section className="hero-market overflow-hidden" aria-labelledby="market-hero-title">
          <div className="hero-market-copy flex flex-col justify-center">
            <p className="eyebrow text-primary">
              <MapPin className="size-4" aria-hidden />
              <UiText>{area ? `Shopping in ${area.name}` : "Choose an area to shop nearby"}</UiText>
            </p>
            <h1 id="market-hero-title" className="mt-3 font-display font-medium leading-[0.95]">
              <UiText>{"Your neighbourhood,"}</UiText>
              <br />
              <UiText>{"ready when you are"}</UiText>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-foreground/85 md:text-lg">
              <UiText>
                Choose a nearby shop, see what is available, and get your order packed with care.
              </UiText>
            </p>
            <div className="hero-market-actions mt-7 flex flex-wrap items-center gap-4">
              <Link
                to="/"
                hash="shops-h"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90"
              >
                <UiText>{"Browse nearby shops"}</UiText>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <span className="hero-market-note">
                <UiText>Your bag stays organised shop by shop.</UiText>
              </span>
            </div>
          </div>
          <figure className="hero-market-image overflow-hidden">
            <img
              src={imageUrl("/market-hero-v2.webp")}
              fetchPriority="high"
              alt="A neighbourhood shopkeeper packing fresh vegetables into a paper bag"
              width={1280}
              height={1600}
              className="absolute inset-0 size-full object-cover object-center"
            />
            <figcaption className="hero-market-caption">
              <span>Neighbourhood first</span>
              Orders are packed by the shop you choose
            </figcaption>
          </figure>
        </section>

        <section className="market-section home-categories" aria-labelledby="cat-h">
          <div className="section-heading">
            <div>
              <p className="eyebrow text-primary">Browse by category</p>
              <h2 id="cat-h" className="font-display text-3xl md:text-4xl">
                Start with what you need
              </h2>
            </div>
            <Link to="/categories" className="market-directory-link">
              <Grid2X2 size={16} aria-hidden />
              <UiText>Categories</UiText> ({categories.length})
            </Link>
          </div>
          <UiAttributes>
            <ul className="category-ribbon no-scrollbar" aria-label="Marketplace categories">
              {visibleCategories.map((category, index) => (
                <li
                  key={category.slug}
                  className={index >= 3 ? "category-mobile-extra" : undefined}
                >
                  <Link
                    to="/category/$slug"
                    params={{ slug: category.slug }}
                    className="category-tile group"
                  >
                    <CategoryArtwork
                      category={category}
                      className={`category-tile-image category-visual-${index}`}
                      width={240}
                    />
                    <span className="category-tile-name">{category.name}</span>
                    <ArrowUpRight className="category-tile-arrow size-4" aria-hidden />
                  </Link>
                </li>
              ))}
              {categories.length > visibleCategories.length && (
                <li className="category-mobile-more">
                  <Link to="/categories" className="category-tile category-tile-more">
                    <Grid2X2 className="size-7" aria-hidden />
                    <span className="category-tile-name">
                      <UiText>More categories</UiText>
                    </span>
                  </Link>
                </li>
              )}
            </ul>
          </UiAttributes>
        </section>

        <section className="market-section home-shops" aria-labelledby="shops-h">
          <div className="section-heading">
            <div>
              <h2 id="shops-h" className="font-display text-3xl md:text-4xl">
                <UiText>
                  {area ? `Nearby shops in ${area.name}` : "Nearby neighbourhood shops"}
                </UiText>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Independent counters. One neighbourhood.
                <UiText>{isDemoMode ? " Demo catalogue." : ""}</UiText>
              </p>
            </div>
            <Link to="/search" className="market-link">
              View products <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="shop-shelf">
            {area && shopPages.isPending && <li role="status">Loading nearby shops…</li>}
            {area && shopPages.isError && (
              <li role="alert">
                Could not load shops.{" "}
                <button onClick={() => void shopPages.refetch()}>Retry shops</button>
              </li>
            )}
            {!shops.length && !shopPages.isPending && !shopPages.isError && (
              <li className="rounded-xl border border-border bg-card p-6 text-sm">
                <UiText>
                  {area
                    ? "No shops are available in this area yet. Try another available area."
                    : "Choose your area above to see shops and their products."}
                </UiText>
              </li>
            )}
            {shops.map((shop, index) => {
              const cataloguePreview = products.find((product) => product.shopId === shop.id);
              return (
                <li key={shop.id}>
                  <Link to="/shop/$slug" params={{ slug: shop.slug }} className="shop-card group">
                    <div className="relative overflow-hidden bg-paper">
                      {isDemoMode && !shop.coverImage && index < 5 ? (
                        <div
                          className="shop-demo-photo"
                          style={{ backgroundPosition: `${index * 25}% center` }}
                        >
                          <span>Illustrative demo image</span>
                        </div>
                      ) : shop.coverImage || cataloguePreview ? (
                        <ProductImage
                          src={shop.coverImage ?? cataloguePreview?.image}
                          alt={
                            shop.coverImage
                              ? `${shop.name} storefront`
                              : `${cataloguePreview?.name ?? "Products"} from ${shop.name}`
                          }
                          className="shop-card-image"
                          width={520}
                        />
                      ) : (
                        <div className="shop-card-image flex items-center justify-center">
                          <ShopInitials shop={shop} />
                        </div>
                      )}
                      <span className="shop-status bg-card/95">
                        <OpenState shop={shop} />
                      </span>
                    </div>
                    <div className="shop-card-body flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 leading-tight">{shop.name}</h3>
                          <p className="mt-1 flex items-center gap-1 text-caption text-muted-foreground">
                            <MapPin className="size-3 shrink-0" aria-hidden /> {shop.locality}
                          </p>
                        </div>
                        <ArrowUpRight
                          className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
                          aria-hidden
                        />
                      </div>
                      <p className="shop-tagline line-clamp-2 text-muted-foreground">
                        {shop.tagline}
                      </p>
                      <div className="mt-4 border-t border-border pt-3">
                        <FulfilmentChips methods={shop.fulfilment} />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {area && (
            <UiAttributes>
              <CatalogueMore
                label="shops"
                hasMore={!!shopPages.hasNextPage}
                busy={shopPages.isFetching}
                error={shopPages.isFetchNextPageError}
                onMore={() => void shopPages.fetchNextPage()}
              />
            </UiAttributes>
          )}
          {area && previews.isError && (
            <p role="alert">
              Product previews could not load.{" "}
              <button onClick={() => void previews.refetch()}>Retry product previews</button>
            </p>
          )}
        </section>

        {isDemoMode && (
          <UiAttributes>
            <section className="market-section" aria-label="Explore marketplace collections">
              <div className="promo-grid">
                <UiAttributes>
                  <PromoCard
                    title="Fresher every day"
                    copy="Seasonal fruits and vegetables from local shops."
                    category="fruits-vegetables"
                    image={
                      categories.find((category) => category.slug === "fruits-vegetables")?.image
                    }
                    tone="produce"
                  />
                </UiAttributes>
                <UiAttributes>
                  <PromoCard
                    title="Hot & tasty from nearby kitchens"
                    copy="Explore prepared meals and snacks from local food businesses."
                    category="fast-food-snacks"
                    image={
                      categories.find((category) => category.slug === "fast-food-snacks")?.image
                    }
                    tone="food"
                  />
                </UiAttributes>
                <UiAttributes>
                  <PromoCard
                    title="Everything for your daily needs"
                    copy="Discover everyday products from neighbourhood shops."
                    category="grocery-kirana"
                    image={categories.find((category) => category.slug === "grocery-kirana")?.image}
                    tone="daily"
                  />
                </UiAttributes>
              </div>
            </section>
          </UiAttributes>
        )}

        {area && products.length > 0 && (
          <>
            <section className="market-section home-fresh" aria-labelledby="fresh-h">
              <div className="section-heading">
                <div>
                  <p className="eyebrow text-success">Picked for today</p>
                  <h2 id="fresh-h" className="font-display text-3xl md:text-4xl">
                    <UiText>{"Fresh picks for today"}</UiText>
                  </h2>
                </div>
                <Link
                  to="/category/$slug"
                  params={{
                    slug:
                      categories.find((c) => c.slug === "fruits-vegetables")?.slug ??
                      categories[0].slug,
                  }}
                  className="market-link"
                >
                  <UiText>{isDemoMode ? "See produce" : "Explore an aisle"}</UiText>{" "}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
              <div className="fresh-grid-wrap">
                <ul className="product-shelf">
                  {fresh.map((p) => (
                    <li key={p.id}>
                      <ProductCard product={p} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="market-section home-pantry" aria-labelledby="best-h">
              <div className="pantry-layout">
                <div className="essentials-panel">
                  <p className="eyebrow text-primary">Keep the basics close</p>
                  <h2 className="mt-2 font-display text-3xl">
                    <UiText>{"Daily essentials"}</UiText>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">The things you run out of.</p>
                  <ul className="essentials-list">
                    {essentials.map((p) => (
                      <li key={p.id}>
                        <ProductCard product={p} variant="row" />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="favourites-panel">
                  <p className="eyebrow text-primary">Popular in this catalogue</p>
                  <h2 id="best-h" className="mt-2 font-display text-3xl">
                    <UiText>{"Neighbourhood favourites"}</UiText>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <UiText>
                      {isDemoMode
                        ? "A few favourites from our demo shop catalogue."
                        : "Selections from shops in your chosen area."}
                    </UiText>
                  </p>
                  <div className="favourites-grid">
                    {bestsellers.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                  <div className="seller-invite">
                    <div>
                      <p className="eyebrow">Behind every bag, a local shop.</p>
                      <h3 className="font-display">Your counter belongs here, too.</h3>
                      <p>Bring your shop to the neighbourhood marketplace.</p>
                    </div>
                    <Link to="/seller">
                      Explore selling <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
        <section className="market-steps home-how" aria-labelledby="how-h">
          <div className="market-section how-inner">
            <div className="how-intro">
              <p className="eyebrow text-primary">From their counter to your door</p>
              <h2 id="how-h" className="how-title font-display">
                Local shopping.
                <br />
                <em>Simply connected.</em>
              </h2>
              <p className="how-description">
                Your favourite local counters, with one place to keep track of everything.
              </p>
              <Link to="/" hash="cat-h" className="market-link">
                Start exploring <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ol className="how-step-list">
              {[
                ["Pick a lane", "Choose a category, then a specific nearby shop."],
                ["Fill your bag", "Products remain grouped with the shop that lists them."],
                [
                  "Each shop accepts",
                  "Every shop confirms its part of the order and starts packing. You'll see each one separately.",
                ],
                ["Receive your order", "Delivery or pickup options depend on the shop you choose."],
              ].map(([t, b], i) => (
                <li key={t} className="how-step">
                  <span className="how-step-number" aria-hidden>
                    0{i + 1}
                  </span>
                  <div>
                    <h3>{t}</h3>
                    <p>{b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="how-promises">
              <span>✓ Prices are set by each shop</span>
              <span>✓ Your bag stays grouped by shop</span>
              <span>✓ Pick delivery or pickup where available</span>
              <Link
                to="/seller"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <UiText>{"Own a shop? Sell with us "}</UiText>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </StoreLayout>
  );
}

function PromoCard({
  title,
  copy,
  category,
  image,
  tone,
}: {
  title: string;
  copy: string;
  category: string;
  image?: string;
  tone: "produce" | "food" | "daily";
}) {
  return (
    <Link
      to="/category/$slug"
      params={{ slug: category }}
      className={`promo-card promo-card-${tone} group`}
    >
      <div className="relative z-10 max-w-56">
        <h2 className="font-display text-3xl leading-[0.95]">
          <UiText>{title}</UiText>
        </h2>
        <p className="mt-3 text-sm leading-snug">{copy}</p>
        <span className="mt-6 inline-flex size-10 items-center justify-center rounded-full bg-card text-foreground transition group-hover:translate-x-1">
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </div>
      {image && <span className={`promo-card-image promo-photo-${tone}`} aria-hidden />}
    </Link>
  );
}
