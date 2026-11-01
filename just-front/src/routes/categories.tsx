import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ArrowUpRight, MapPin, Store } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { CategoryArtwork } from "@/components/store/CategoryArtwork";
import "@/styles/category-market.css";
import { CategoryTile } from "@/components/store/CategoryTile";
import { EmptyState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { categoriesQuery } from "@/services/catalog";
import { useAreaShopPages } from "@/components/store/useAreaShops";
import { useLocationArea } from "@/stores/location";

export const Route = createFileRoute("/categories")({
  head: () => ({ meta: [{ title: "Explore the market: Just Pack It" }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(categoriesQuery())]),
  component: Categories,
});

function Categories() {
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const shopPages = useAreaShopPages();
  const shops = shopPages.shops;
  const { area } = useLocationArea();
  const [q, setQ] = useState("");
  const matches = categories.filter((category) =>
    `${category.name} ${category.blurb} ${category.subcategories?.map((sub) => sub.name).join(" ") ?? ""}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  return (
    <StoreLayout>
      <section className="market-directory-hero mx-auto" aria-labelledby="directory-heading">
        <div>
          <p className="market-category-eyebrow">
            <Store size={16} aria-hidden="true" /> The neighbourhood directory
          </p>
          <h1 id="directory-heading">
            Everyday needs.
            <br />
            <em>Extraordinary locals.</em>
          </h1>
          <p>
            From the first cup of chai to the last thing on your list. Find your lane, then choose a
            shop.
          </p>
          <span className="market-category-area">
            <MapPin size={15} aria-hidden="true" />
            {area ? `Exploring ${area.name}` : "Choose your area to find nearby shops"}
          </span>
        </div>
        <div className="market-directory-collage" aria-hidden="true">
          {categories.slice(0, 3).map((category) => (
            <div key={category.slug}>
              <CategoryArtwork category={category} />
              <span>{category.name}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="market-directory-content mx-auto max-w-7xl px-4">
        <div className="market-directory-toolbar">
          <div>
            <p className="market-category-eyebrow">Pick your lane</p>
            <h2>What’s on your list?</h2>
          </div>
          <label className="directory-search">
            <Search className="size-4" aria-hidden />
            <span className="sr-only">Search categories</span>
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Find grocery, fashion, meals…"
            />
          </label>
        </div>
        <p className="market-directory-count my-5 text-sm text-muted-foreground" aria-live="polite">
          {matches.length} categories in the current catalogue
          <ArrowUpRight size={16} aria-hidden="true" />
        </p>
        {matches.length ? (
          <ul className="category-directory-grid">
            {matches.map((category) => (
              <li key={category.slug}>
                <CategoryTile
                  category={category}
                  shopCount={
                    area && !shopPages.hasNextPage && shopPages.isSuccess
                      ? shops.filter((shop) => shop.categories.includes(category.slug)).length
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No lanes match that search" body="Try another category name." />
        )}
      </div>
    </StoreLayout>
  );
}
