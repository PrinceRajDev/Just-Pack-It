import { UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { StoreLayout, PageTitle } from "@/components/store/StoreLayout";
import { ProductBrowser } from "@/components/store/ProductBrowser";
import { useAreaShopPages } from "@/components/store/useAreaShops";
import { ShopInitials, OpenState } from "@/components/store/ShopMark";
import { searchMatches } from "@/lib/search";

const schema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "name"]).optional(),
  inStockOnly: z.boolean().optional(),
  offersOnly: z.boolean().optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: schema,
  head: () => ({
    meta: [
      { title: "Search products: Just Pack It" },
      {
        name: "description",
        content: "Search groceries and essentials from local shops near you.",
      },
      { property: "og:title", content: "Search: Just Pack It" },
      { property: "og:description", content: "Find products from neighbourhood stores." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const shops = useAreaShopPages({ q: search.q?.trim() || undefined }).shops;
  const term = search.q?.trim().toLowerCase();
  const matchingShops = term
    ? shops
        .filter((shop) => searchMatches(`${shop.name} ${shop.tagline} ${shop.locality}`, term))
        .slice(0, 4)
    : [];
  return (
    <StoreLayout>
      <UiAttributes>
        <PageTitle eyebrow="Search" title={search.q ? `“${search.q}”` : "All products"} />
      </UiAttributes>
      <div className="mx-auto max-w-7xl px-4">
        {search.q && (
          <button
            className="mb-5 text-sm font-medium text-primary underline underline-offset-4"
            onClick={() => navigate({ search: (current) => ({ ...current, q: undefined }) })}
          >
            Clear search
          </button>
        )}
        {matchingShops.length > 0 && (
          <section className="search-shop-results" aria-labelledby="matching-shops">
            <h2 id="matching-shops" className="font-display text-2xl">
              Shops matching your search
            </h2>
            <ul>
              {matchingShops.map((shop) => (
                <li key={shop.id}>
                  <Link to="/shop/$slug" params={{ slug: shop.slug }}>
                    <ShopInitials shop={shop} />
                    <span>
                      <strong>{shop.name}</strong>
                      <OpenState shop={shop} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ProductBrowser
          query={search}
          onChange={(q) => navigate({ search: (s) => ({ ...s, ...q }) })}
          emptyHint={search.q ? `No shop near you lists “${search.q}” yet.` : undefined}
        />
      </div>
    </StoreLayout>
  );
}
