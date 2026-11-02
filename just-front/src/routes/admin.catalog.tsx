import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { DataTable } from "@/components/portal/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { products, categories } from "@/mocks/data";
import { shopById } from "@/services/catalog";
import { inr } from "@/lib/image";
import { ConfirmAction } from "@/components/common/ConfirmAction";

export const Route = createFileRoute("/admin/catalog")({ component: Catalog });

function Catalog() {
  const [taxonomy, setTaxonomy] = useState(categories);
  const [name, setName] = useState("");
  const addCategory = () => {
    const clean = name.trim();
    const slug = clean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    if (!clean || !slug || taxonomy.some((category) => category.slug === slug)) return;
    setTaxonomy((current) => [
      ...current,
      {
        slug,
        name: clean,
        blurb: "New category awaiting shop onboarding.",
        image: categories[0].image,
      },
    ]);
    setName("");
    toast.success("Category added for this demo session");
  };
  return (
    <>
      <UiAttributes>
        <PortalHeader
          title="Catalogue moderation"
          sub={`${taxonomy.length} categories · ${products.length} products`}
        />
      </UiAttributes>
      <section className="mb-10 border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-stamp text-muted-foreground">Platform taxonomy</p>
            <h2 className="mt-1 font-display text-2xl">Categories and subcategories</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These definitions drive market discovery. Changes are demo-only until the admin
              category API is connected.
            </p>
          </div>
          <div className="taxonomy-add flex gap-2">
            <UiAttributes>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addCategory()}
                placeholder="New category name"
                aria-label="New category name"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </UiAttributes>
            <Button onClick={addCategory}>
              <UiText>{"Add category"}</UiText>
            </Button>
          </div>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {taxonomy.map((category) => (
            <li
              key={category.slug}
              className="flex items-center justify-between gap-3 border border-border p-3 text-sm"
            >
              <span>
                <span className="font-medium">{category.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {category.subcategories?.length ?? 0} subcategories
                </span>
              </span>
              <UiAttributes>
                <ConfirmAction
                  title={`Remove ${category.name}?`}
                  description="This only removes the category from the current admin demo session. Marketplace categories are persisted through the backend category API."
                  confirmLabel="Remove from preview"
                  onConfirm={() => {
                    setTaxonomy((current) => current.filter((item) => item.slug !== category.slug));
                    toast("Removed from this demo session");
                  }}
                >
                  <Button size="sm" variant="ghost">
                    <UiText>{"Remove"}</UiText>
                  </Button>
                </ConfirmAction>
              </UiAttributes>
            </li>
          ))}
        </ul>
      </section>
      <DataTable
        rows={products}
        searchText={(r) => `${r.name} ${shopById(r.shopId)?.name}`}
        columns={[
          {
            key: "n",
            header: "Product",
            cell: (r) => <span className="line-clamp-1 max-w-xs">{r.name}</span>,
          },
          { key: "s", header: "Shop", cell: (r) => shopById(r.shopId)?.name },
          {
            key: "c",
            header: "Category",
            cell: (r) => taxonomy.find((c) => c.slug === r.categorySlug)?.name ?? r.categorySlug,
          },
          { key: "p", header: "Price", cell: (r) => inr(r.price), className: "tabular-nums" },
          {
            key: "st",
            header: "Stock",
            cell: (r) => (
              <UiAttributes>
                <StatusBadge
                  status={r.stock === 0 ? "out" : r.stock <= 5 ? "low" : "active"}
                  label={String(r.stock)}
                />
              </UiAttributes>
            ),
          },
          {
            key: "a",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toast(`${r.name} flagged for review (demo)`)}
              >
                Flag
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}
