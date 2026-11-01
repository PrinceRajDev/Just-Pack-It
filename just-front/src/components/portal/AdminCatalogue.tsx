import { useQuery } from "@tanstack/react-query";
import { Package, ShoppingBag, Ban, Store, ChevronRight } from "lucide-react";
import { management } from "@/services/management";
import { imageUrl } from "@/lib/image";
import { ProductModeration } from "./AdminWorkspace";
import { Taxonomy } from "./AdminTaxonomy";
import "@/styles/admin-catalogue.css";

export function AdminCatalogue() {
  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: management.adminCategories,
    retry: false,
  });
  const cards = [
    { title: "Total products", icon: Package, note: "Global reporting unavailable" },
    { title: "Seller-active products", icon: ShoppingBag, note: "Global reporting unavailable" },
    { title: "Blocked products", icon: Ban, note: "Global reporting unavailable" },
    {
      title: "Active categories",
      icon: Store,
      note: categories.isError ? "Could not load categories" : "Marketplace categories",
    },
  ];
  return (
    <div className="admin-catalogue">
      <header className="catalog-hero">
        <div>
          <nav aria-label="Breadcrumb">
            OPERATIONS <ChevronRight size={13} /> <b>CATALOGUE</b>
          </nav>
          <h1>Catalogue</h1>
          <p>
            Manage products and categories across all shops. Keep the marketplace organised,
            relevant and safe for local communities.
          </p>
        </div>
        <div className="catalog-hero-art">
          <img src={imageUrl("/admin-catalogue-hero-v1.webp")} alt="" />
          <aside>
            <Package />
            <h2>
              Safe products.
              <br />
              Trusted neighbourhoods.
            </h2>
            <p>Keep the marketplace clean, relevant and helpful for local communities.</p>
          </aside>
        </div>
      </header>
      <section className="catalog-metrics" aria-label="Catalogue statistics">
        {cards.map(({ title, icon: Icon, note }, i) => (
          <article key={title}>
            <Icon />
            <div>
              <p>{title}</p>
              <strong>
                {i === 3 && categories.isSuccess
                  ? categories.data.filter((c) => c.active !== false).length
                  : "N/A"}
              </strong>
              <small>{i === 3 && categories.isPending ? "Loading categories…" : note}</small>
            </div>
          </article>
        ))}
      </section>
      <p className="catalog-report-note">
        Product totals are not supplied by the current API. Seller-active does not guarantee
        purchasability: shop approval, availability, stock and admin blocks still apply.
      </p>
      <ProductModeration />
      <section className="catalog-panel">
        <Taxonomy />
      </section>
    </div>
  );
}
