import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
import type { ManagedCategory, ManagedProduct, ManagedShop } from "@/domain/management";
import type { ProductVariant } from "@/domain/types";
import { PortalHeader } from "./PortalShell";
import { ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/store/ProductImage";
import { inr } from "@/lib/image";
import { useDraftGuard } from "./useDraftGuard";
import { ProductPhotoUpload } from "./ProductPhotoUpload";
import {
  Attributes,
  attributes,
  Field,
  Panel,
  SaveError,
  useSave,
  text,
  number,
} from "./management-shared";

export function LiveProducts({
  shop,
  categories,
  path,
}: {
  shop: ManagedShop;
  categories: ManagedCategory[];
  path: string;
}) {
  const products = useQuery({ queryKey: ["seller-products"], queryFn: management.products });
  const navigate = useNavigate();
  const [baseDirty, setBaseDirty] = useState(false);
  const [variantDirty, setVariantDirty] = useState(false);
  const [imageEditing, setImageEditing] = useState(false);
  const editId = path.match(/^\/seller\/products\/([^/]+)\/edit\/?$/)?.[1];
  const detailId = editId;
  const detail = useQuery({
    queryKey: ["seller-product", detailId],
    queryFn: () => management.product(detailId!),
    enabled: !!detailId,
    refetchOnWindowFocus: false,
  });
  if (products.error || detail.error)
    return (
      <ErrorState
        message={(products.error || detail.error)?.message}
        onRetry={() => {
          void products.refetch();
          if (detailId) void detail.refetch();
        }}
      />
    );
  if (products.isPending || (detailId && detail.isPending))
    return <p role="status">Loading catalogue…</p>;
  const adding = path === "/seller/products/new";
  const editing = detailId ? detail.data : undefined;
  return (
    <>
      <PortalHeader
        title={adding ? "Add a listing" : editing ? "Edit listing" : "Your catalogue"}
        sub={`Shop approval: ${shop.status}. Only approved, active shops appear in the marketplace.`}
        actions={
          <Button asChild>
            <Link to="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      {editing?.moderation?.blocked && (
        <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">
          This listing is blocked by admin: {editing.moderation.reason}. Editing or activating it
          does not remove this block.
        </p>
      )}
      {adding || editing ? (
        <>
          <fieldset disabled={variantDirty || imageEditing}>
            {variantDirty && (
              <p className="mb-3 text-sm">Save option changes before editing the listing.</p>
            )}
            <ProductForm
              key={`${editing?.id ?? "new"}:${editing?.version ?? 0}`}
              product={editing ?? undefined}
              shop={shop}
              categories={categories}
              onDirty={(dirty) => setBaseDirty(dirty)}
              onCreated={(product) => {
                void navigate({ to: "/seller/products/$id/edit", params: { id: product.id } });
              }}
            />
          </fieldset>
          {editing && (
            <fieldset disabled={baseDirty || imageEditing}>
              {baseDirty && (
                <p className="mb-3 text-sm">Save listing changes before editing options.</p>
              )}
              <VariantManager key={editing.id} product={editing} onDirty={setVariantDirty} />
            </fieldset>
          )}
          {editing && (
            <div className="mt-4">
              <ProductPhotoUpload
                key={`${editing.id}:${editing.version}`}
                product={editing}
                disabled={baseDirty || variantDirty}
                onEditing={setImageEditing}
              />
            </div>
          )}
        </>
      ) : products.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {products.data.map((p) => (
            <Panel key={p.id}>
              <div className="flex items-center gap-4">
                <div className="w-20 shrink-0">
                  <ProductImage src={p.image} alt={p.name} width={120} />
                </div>
                <div>
                  <h2 className="font-medium">{p.name}</h2>
                  <p className="text-sm">
                    {p.active ? "Active" : "Inactive"} ·{" "}
                    {inr(
                      p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.price,
                    )}{" "}
                    ·{" "}
                    {p.variants?.length ? p.variants.reduce((sum, v) => sum + v.stock, 0) : p.stock}{" "}
                    in stock
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.variants?.length ?? 0} options · {p.unit}
                  </p>
                </div>
              </div>
              <Button variant="outline" asChild>
                <Link to="/seller/products/$id/edit" params={{ id: p.id }}>
                  Edit listing and stock
                </Link>
              </Button>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No listings yet"
          body="Add actual products from your shop. Prices and stock are saved independently for each listing."
        />
      )}
    </>
  );
}

function ProductForm({
  product,
  shop,
  categories,
  onCreated,
  onDirty,
}: {
  product?: ManagedProduct;
  shop: ManagedShop;
  categories: ManagedCategory[];
  onCreated: (product: ManagedProduct) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const save = useSave();
  const draft = useDraftGuard();
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [image, setImage] = useState(product?.image ?? "");
  return (
    <Panel>
      {draft.dialog}
      <form
        onChange={() => {
          draft.mark();
          onDirty(true);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          save.mutate(async () => {
            const input = {
              name: text(data, "name"),
              unit: text(data, "unit"),
              description: text(data, "description"),
              categoryId,
              price: number(data, "price"),
              stock: product?.variants?.length ? product.stock : number(data, "stock"),
              active: data.has("active"),
              attributes: attributes(data),
              ...(text(data, "subcategoryId")
                ? { subcategoryId: text(data, "subcategoryId") }
                : product
                  ? { subcategoryId: null }
                  : {}),
              ...(text(data, "mrp") ? { mrp: number(data, "mrp") } : product ? { mrp: null } : {}),
              ...(image ? { image } : product ? { image: null } : {}),
            };
            const result = await management.saveProduct(input, product);
            draft.reset();
            onDirty(false);
            if (!product) onCreated(result);
          });
        }}
      >
        <fieldset disabled={save.isPending} className="space-y-4">
          <h2 className="font-display text-2xl">Listing details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" name="name" value={product?.name} required />
            <Field
              label="Unit / pack (e.g. 500 g, piece, portion)"
              name="unit"
              value={product?.unit}
              required
            />
            <Field label="Description" name="description" value={product?.description} />
            <label className="space-y-1 text-sm">
              Shop category
              <select
                name="categoryId"
                required
                className="block w-full rounded border bg-background p-2"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Choose category</option>
                {categories
                  .filter((c) => shop.categoryIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Subcategory (optional)
              <select
                name="subcategoryId"
                key={categoryId}
                className="block w-full rounded border bg-background p-2"
                defaultValue={product?.subcategoryId ?? ""}
              >
                <option value="">None</option>
                {categories
                  .find((c) => c.id === categoryId)
                  ?.subcategories.filter((sub) => shop.subcategoryIds.includes(sub.id))
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label="Base price ₹"
              name="price"
              type="number"
              min={0.01}
              step="0.01"
              value={product?.price}
              required
            />
            <Field
              label="MRP ₹ (optional)"
              name="mrp"
              type="number"
              min={0.01}
              step="0.01"
              value={product?.mrp}
            />
            {!product?.variants?.length && (
              <Field
                label="Stock (whole sale units)"
                name="stock"
                type="number"
                min={0}
                step="1"
                value={product?.stock ?? 0}
                required
              />
            )}
          </div>
          {!!product?.variants?.length && (
            <p className="text-sm">
              This product uses variants. Update each option's price and stock below; base stock is
              not added to variant stock.
            </p>
          )}
          <label className="block text-sm">
            Image HTTPS URL or durable key
            <input
              className="mt-1 block w-full rounded border bg-background p-2"
              name="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {product
              ? "Use the photo uploader below, or provide an existing durable image URL/key here."
              : "Save the listing first to unlock photo uploads. An existing durable image URL/key can also be used."}
          </p>
          {image && (
            <div className="w-32">
              <ProductImage src={image} alt="Listing image preview" width={200} />
            </div>
          )}
          <Attributes values={product?.attributes} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
            Active listing
          </label>
          <p className="text-xs text-muted-foreground">
            Optional variants are managed after saving this listing. Each option has its own price,
            stock and details.
          </p>
          <SaveError error={save.error} />
          <Button type="submit">{save.isPending ? "Saving…" : "Save listing"}</Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/seller/products">Back to products</Link>
          </Button>
        </fieldset>
      </form>
    </Panel>
  );
}

function VariantManager({
  product,
  onDirty,
}: {
  product: ManagedProduct;
  onDirty: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const mark = (value: boolean) => {
    setDirty(value);
    onDirty(value);
  };
  const save = useSave();
  return (
    <Panel>
      <h2 className="font-display text-2xl">Options and stock</h2>
      <p className="text-sm text-muted-foreground">
        Changes save individually. Removing an option makes it unavailable; the last option cannot
        be removed. Deactivate the listing instead.
      </p>
      <SaveError error={save.error} />
      {product.variants?.map((variant) => (
        <div key={variant.id} className="rounded-lg border border-border p-3">
          <p>
            {variant.label} · {inr(variant.price)} · {variant.stock} available
          </p>
          {editing === variant.id ? (
            <VariantForm
              key={`${variant.id}:${product.version}`}
              product={product}
              variant={variant}
              onDirty={mark}
            />
          ) : (
            <Button variant="outline" disabled={dirty} onClick={() => setEditing(variant.id)}>
              Edit {variant.label}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={dirty || save.isPending || (product.variants?.length ?? 0) <= 1}
            onClick={() => save.mutate(() => management.removeVariant(product, variant.id))}
          >
            Remove {variant.label}
          </Button>
        </div>
      ))}
      <h3 className="font-medium">Add an option</h3>
      {editing ? (
        <Button type="button" variant="outline" disabled={dirty} onClick={() => setEditing(null)}>
          Add another option
        </Button>
      ) : (
        <VariantForm key={`new:${product.version}`} product={product} onDirty={mark} />
      )}
    </Panel>
  );
}
function VariantForm({
  product,
  variant,
  onDirty,
}: {
  product: ManagedProduct;
  variant?: ProductVariant;
  onDirty: (dirty: boolean) => void;
}) {
  const save = useSave();
  const draft = useDraftGuard();
  return (
    <form
      onChange={() => {
        draft.mark();
        onDirty(true);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        save.mutate(async () => {
          await management.variant(
            product,
            {
              label: text(data, "label"),
              price: number(data, "price"),
              stock: number(data, "stock"),
              attributes: attributes(data),
            },
            variant?.id,
          );
          draft.reset();
          onDirty(false);
        });
      }}
    >
      <fieldset disabled={save.isPending} className="space-y-3">
        {draft.dialog}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Option label (size / colour / weight)"
            name="label"
            value={variant?.label}
            required
          />
          <Field
            label="Price ₹"
            name="price"
            type="number"
            min={0.01}
            step="0.01"
            value={variant?.price}
            required
          />
          <Field
            label="Available stock"
            name="stock"
            type="number"
            min={0}
            step="1"
            value={variant?.stock ?? 0}
            required
          />
        </div>
        <Attributes values={variant?.attributes} />
        <SaveError error={save.error} />
        <Button type="submit">
          {save.isPending ? "Saving…" : variant ? "Save option" : "Add option"}
        </Button>
      </fieldset>
    </form>
  );
}
