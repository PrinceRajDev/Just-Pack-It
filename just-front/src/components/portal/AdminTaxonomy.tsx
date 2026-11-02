import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
import { adminWorkspace } from "@/services/admin-workspace";
import type { ManagedCategory } from "@/domain/management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/common/states";
import { ConfirmAction } from "@/components/common/ConfirmAction";
import { Field, Panel, SaveError, useSave, text } from "./management-shared";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { FolderTree, Plus, ChevronRight } from "lucide-react";
export function Taxonomy() {
  const [editing, setEditing] = useState<ManagedCategory | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const query = useQuery({ queryKey: ["admin-categories"], queryFn: management.adminCategories });
  if (query.error)
    return (
      <UiAttributes>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </UiAttributes>
    );
  if (query.isPending) return <p role="status">Loading categories…</p>;
  const term = search.trim().toLowerCase();
  const filtered = query.data.filter(
    (category) =>
      (status === "all" || (category.active !== false) === (status === "active")) &&
      [
        category.name,
        category.slug,
        category.id,
        ...category.subcategories.flatMap((sub) => [sub.name, sub.slug, sub.id]),
      ].some((value) => value.toLowerCase().includes(term)),
  );
  return (
    <>
      <header className="catalog-panel-heading">
        <div>
          <h2>
            <FolderTree />
            <UiText>{"Marketplace taxonomy"}</UiText>
          </h2>
          <p>Changes are persisted through admin APIs. IDs and URL slugs remain stable.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} />
          <UiText>{"Add category"}</UiText>
        </Button>
      </header>
      <UiAttributes>
        <section
          aria-label="Category discovery"
          className="mb-6 space-y-3 rounded-xl border bg-card p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-full text-sm sm:flex-1">
              Search categories and subcategories
              <UiAttributes>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, slug or ID"
                  className="mt-1"
                />
              </UiAttributes>
            </label>
            <label className="text-sm">
              Category status
              <UiAttributes>
                <select
                  aria-label="Category status"
                  className="ml-2 rounded-lg border bg-background p-2"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="all">
                    <UiText>{"All categories"}</UiText>
                  </option>
                  <option value="active">
                    <UiText>{"Active"}</UiText>
                  </option>
                  <option value="inactive">
                    <UiText>{"Inactive"}</UiText>
                  </option>
                </select>
              </UiAttributes>
            </label>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <UiText>{"Refresh categories"}</UiText>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              <UiText>{"Clear filters"}</UiText>
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {filtered.length} matching categories ·{" "}
            {query.data.filter((c) => c.active !== false).length} active ·{" "}
            {query.data.filter((c) => c.active === false).length} inactive. Search includes
            subcategory names and slugs.
          </p>
        </section>
      </UiAttributes>
      <div className="taxonomy-list">
        {!filtered.length && (
          <div className="catalog-empty">
            <FolderTree size={40} />
            <h3>No categories found</h3>
            <p>No categories match these filters. Clear filters or add a marketplace category.</p>
          </div>
        )}
        {filtered.map((category) => (
          <article className="taxonomy-row" key={category.id}>
            <div>
              <h3>{category.name}</h3>
              <p>{category.blurb || "No description added."}</p>
              <small>/{category.slug}</small>
            </div>
            <span>{category.subcategories.length} subcategories</span>
            <span className={category.active === false ? "catalog-badge muted" : "catalog-badge"}>
              <UiText>{category.active === false ? "Inactive" : "Active"}</UiText>
            </span>
            <Button variant="outline" onClick={() => setEditing(category)}>
              Manage <ChevronRight size={15} />
            </Button>
            <details>
              <summary>View subcategories</summary>
              <p className="break-all">Category ID: {category.id}</p>
              <ul>
                {category.subcategories.map((sub) => (
                  <li key={sub.id}>
                    {sub.name}{" "}
                    <small>
                      /{sub.slug} · <UiText>{sub.active === false ? "Inactive" : "Active"}</UiText>
                    </small>
                  </li>
                ))}
              </ul>
              {!category.subcategories.length && <p>No subcategories yet.</p>}
            </details>
          </article>
        ))}
      </div>
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent className="catalog-drawer">
          <SheetTitle>
            <UiText>{editing === "new" ? "Add category" : "Manage category"}</UiText>
          </SheetTitle>
          <SheetDescription>
            Edit supported fields and manage subcategories. Existing IDs and slugs stay unchanged.
          </SheetDescription>
          {editing && (
            <CategoryForm
              key={
                editing === "new"
                  ? "new"
                  : `${editing.id}:${query.data.find((c) => c.id === editing.id)?.version}`
              }
              category={
                editing === "new"
                  ? undefined
                  : (query.data.find((c) => c.id === editing.id) ?? editing)
              }
              onCreated={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
function CategoryForm({
  category,
  onCreated,
}: {
  category?: ManagedCategory;
  onCreated: () => void;
}) {
  const save = useSave();
  return (
    <Panel>
      <h2 className="font-display text-xl">
        <UiText>
          {category
            ? `${category.name}${category.active === false ? " (inactive)" : ""}`
            : "Add a category"}
        </UiText>
      </h2>
      {category && (
        <p className="break-all text-sm text-muted-foreground">
          <UiText>{category.active === false ? "Inactive" : "Active"}</UiText> · Slug:{" "}
          {category.slug} · ID: {category.id} ·{" "}
          {category.subcategories.filter((sub) => sub.active !== false).length} active subcategories
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          save.mutate(
            () =>
              management.category(
                {
                  name: text(data, "name"),
                  blurb: text(data, "blurb"),
                  ...(!category ? { slug: text(data, "slug") } : {}),
                },
                category,
              ),
            {
              onSuccess: () => {
                if (!category) {
                  form.reset();
                  onCreated();
                }
              },
            },
          );
        }}
      >
        <fieldset disabled={save.isPending || category?.active === false} className="space-y-3">
          <label className="block text-sm">
            Category name
            <Input
              name="name"
              defaultValue={category?.name}
              required
              maxLength={120}
              onChange={(event) => {
                if (!category) {
                  const slug = event.currentTarget.form?.elements.namedItem(
                    "slug",
                  ) as HTMLInputElement | null;
                  if (slug && !slug.dataset.edited)
                    slug.value = event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "");
                }
              }}
            />
          </label>
          {!category && (
            <label className="block text-sm">
              URL slug
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={120}
                onChange={(e) => {
                  e.currentTarget.dataset.edited = "true";
                }}
              />
            </label>
          )}
          <UiAttributes>
            <Field label="Description" name="blurb" value={category?.blurb} />
          </UiAttributes>
          <Button type="submit">
            <UiText>{save.isPending ? "Saving…" : "Save category"}</UiText>
          </Button>
        </fieldset>
      </form>
      {category && (
        <>
          {category.active === false && (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(() => adminWorkspace.reactivate(category.id, category.version))
              }
            >
              Reactivate category
            </Button>
          )}
          <UiAttributes>
            <ConfirmAction
              title={`Deactivate ${category.name}?`}
              description="This hides an unused category from discovery. The server will refuse this change if shops or products still reference it."
              confirmLabel="Deactivate category"
              onConfirm={() => save.mutate(() => management.removeCategory(category))}
            >
              <Button variant="outline" disabled={save.isPending || category.active === false}>
                Deactivate category
              </Button>
            </ConfirmAction>
          </UiAttributes>
          <p className="text-xs text-muted-foreground">
            Deactivation is refused if shops/products still reference this category.
          </p>
          {category.subcategories.map((sub) => (
            <form
              key={sub.id}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                save.mutate(() =>
                  management.subcategory(category, { name: text(data, "name") }, sub.id),
                );
              }}
            >
              <p className="break-all text-xs text-muted-foreground">
                <UiText>{sub.active === false ? "Inactive" : "Active"}</UiText> · {sub.slug} · ID:{" "}
                {sub.id}
              </p>
              {sub.active === false && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending || category.active === false}
                  onClick={() =>
                    save.mutate(() =>
                      adminWorkspace.reactivate(category.id, category.version, sub.id),
                    )
                  }
                >
                  Reactivate {sub.name}
                </Button>
              )}
              <fieldset
                disabled={save.isPending || category.active === false || sub.active === false}
                className="flex flex-wrap items-end gap-2"
              >
                <UiAttributes>
                  <Field
                    label={
                      sub.active === false ? "Subcategory name (inactive)" : "Subcategory name"
                    }
                    name="name"
                    value={sub.name}
                    required
                  />
                </UiAttributes>
                <Button type="submit" variant="outline">
                  Rename
                </Button>
                <UiAttributes>
                  <ConfirmAction
                    title={`Deactivate ${sub.name}?`}
                    description="Referenced subcategories cannot be deactivated. This change will be saved to the server."
                    confirmLabel="Deactivate subcategory"
                    onConfirm={() =>
                      save.mutate(() => management.removeSubcategory(category, sub.id))
                    }
                  >
                    <Button type="button" variant="ghost">
                      Deactivate {sub.name}
                    </Button>
                  </ConfirmAction>
                </UiAttributes>
              </fieldset>
            </form>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              save.mutate(() =>
                management.subcategory(category, {
                  name: text(data, "name"),
                  slug: text(data, "slug"),
                }),
              );
            }}
          >
            <fieldset disabled={save.isPending || category.active === false} className="space-y-3">
              <UiAttributes>
                <Field label="New subcategory name" name="name" required />
              </UiAttributes>
              <UiAttributes>
                <Field label="New subcategory slug" name="slug" required />
              </UiAttributes>
              <Button type="submit" variant="outline">
                Add subcategory
              </Button>
            </fieldset>
          </form>
        </>
      )}
      <SaveError error={save.error} />
    </Panel>
  );
}
