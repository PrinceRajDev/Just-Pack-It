import { ProductDraftAssistant } from "./ProductDraftAssistant";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { productImages } from "@/services/product-images";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { management } from "@/services/management";
import type { ManagedCategory, ManagedProduct, ManagedShop } from "@/domain/management";
import type { ProductVariant } from "@/domain/types";
import { PortalHeader } from "./PortalShell";
import { ErrorState, EmptyState } from "@/components/common/states";
import { Plus, Package, Tag, Store, Box } from "lucide-react";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { OrderBoxIllustration } from "./OrderBoxIllustration";
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
    <div className={path.startsWith("/seller/products") ? "seller-products-page" : undefined}>
      {path === "/seller/inventory" ? (
        <PortalHeader
          title={adding ? "Add a listing" : editing ? "Edit listing" : "Your catalogue"}
          sub={`Shop approval: ${shop.status}. Only approved, active shops appear in the marketplace.`}
          actions={
            <Button asChild>
              <Link to="/seller/products/new">Add product</Link>
            </Button>
          }
        />
      ) : (
        <header className="seller-catalogue-hero">
          <div>
            <p className="workspace-eyebrow">Just Pack It · Workspace</p>
            <h1>{adding ? "Add a listing" : editing ? "Edit listing" : "Your catalogue"}</h1>
            <p>
              <span className="seller-approval-chip" data-status={shop.status}>
                Shop approval: {shop.status}
              </span>{" "}
              Only approved, active shops appear in the marketplace.
            </p>
          </div>
          <div className="seller-catalogue-art" aria-hidden="true">
            {adding || editing ? <OrderBoxIllustration /> : <NeighbourhoodIllustration />}
          </div>
          {!adding && !editing && (
            <Button asChild className="seller-catalogue-add">
              <Link to="/seller/products/new">
                <Plus size={18} aria-hidden="true" />
                Add product
              </Link>
            </Button>
          )}
        </header>
      )}
      {editing?.moderation?.blocked && (
        <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">
          This listing is blocked by admin: {editing.moderation.reason}. Editing or activating it
          does not remove this block.
        </p>
      )}
      {adding || editing ? (
        <>
          <fieldset disabled={variantDirty}>
            {variantDirty && (
              <p className="mb-3 text-sm">Save option changes before editing the listing.</p>
            )}
            <ProductForm
              key={`${editing?.id ?? "new"}:${editing?.version ?? 0}`}
              product={editing ?? undefined}
              shop={shop}
              categories={categories}
              imageEditing={imageEditing}
              photoEditor={
                editing ? (
                  <ProductPhotoUpload
                    key={`${editing.id}:${editing.version}`}
                    product={editing}
                    disabled={baseDirty || variantDirty}
                    onEditing={setImageEditing}
                  />
                ) : undefined
              }
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
        </>
      ) : products.data?.length ? (
        <div className="seller-catalogue-grid grid gap-4 md:grid-cols-2">
          {products.data.map((p) => (
            <Panel key={p.id}>
              <div className="flex items-center gap-4">
                <div className="seller-product-thumbnail w-20 shrink-0">
                  <ProductImage src={p.image} alt={p.name} width={120} />
                </div>
                <div>
                  <h2 className="font-medium">{p.name}</h2>
                  {path.startsWith("/seller/products") && (
                    <p className="seller-product-category">
                      {categories.find((category) => category.id === p.categoryId)?.name ??
                        "Category unavailable"}
                    </p>
                  )}
                  <p
                    className="seller-product-status text-sm"
                    data-active={p.active && !p.moderation?.blocked}
                  >
                    {p.moderation?.blocked ? "Blocked" : p.active ? "Active" : "Inactive"} ·{" "}
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
              <div className="seller-product-card-actions">
                <Button variant="outline" asChild>
                  <Link to="/seller/products/$id/edit" params={{ id: p.id }}>
                    Edit product
                  </Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/seller/inventory">Update stock</Link>
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      ) : path === "/seller/inventory" ? (
        <EmptyState
          title="No listings yet"
          body="Add actual products from your shop. Prices and stock are saved independently for each listing."
        />
      ) : (
        <section className="seller-catalogue-empty" aria-label="Empty catalogue">
          <OrderBoxIllustration />
          <h2>No listings yet</h2>
          <p>
            Add actual products from your shop. Prices and stock are saved independently for each
            listing.
          </p>
          <Button asChild>
            <Link to="/seller/products/new">
              <Plus size={18} aria-hidden="true" />
              Add your first product
            </Link>
          </Button>
          <ol className="seller-catalogue-guidance">
            {[
              { Icon: Package, title: "List your products", body: "Add items from your shop" },
              { Icon: Tag, title: "Set price & stock", body: "Keep it up to date" },
              {
                Icon: Store,
                title: "Go live in marketplace",
                body: "Approved, active shops appear for buyers",
              },
            ].map(({ Icon, title, body }) => (
              <li key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function ProductForm({
  product,
  shop,
  categories,
  onCreated,
  onDirty,
  photoEditor,
  imageEditing = false,
}: {
  product?: ManagedProduct;
  photoEditor?: ReactNode;
  imageEditing?: boolean;
  shop: ManagedShop;
  categories: ManagedCategory[];
  onCreated: (product: ManagedProduct) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const save = useSave();
  const draft = useDraftGuard();
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const image = product?.image ?? "";
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [photoError, setPhotoError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const capability = useQuery({
    queryKey: ["seller-image-upload"],
    queryFn: productImages.capability,
    enabled: !product,
    staleTime: 60000,
  });
  useEffect(() => {
    if (!photo) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  return (
    <Panel>
      {draft.dialog}
      <form
        ref={formRef}
        className="seller-listing-form"
        onChange={(event) => {
          if (product && (event.target as HTMLElement).closest(".product-photo-editor")) return;
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
              attributes: product?.attributes ?? [],
              ...(text(data, "subcategoryId")
                ? { subcategoryId: text(data, "subcategoryId") }
                : product
                  ? { subcategoryId: null }
                  : {}),
              ...(text(data, "mrp") ? { mrp: number(data, "mrp") } : product ? { mrp: null } : {}),
              ...(image ? { image } : product ? { image: null } : {}),
            };
            const result = await management.saveProduct(input, product);
            if (!product) {
              let created = result;
              if (photo) {
                try {
                  created = await productImages.upload(result, photo);
                } catch {
                  toast.error(
                    "Listing saved, but the photo upload could not be confirmed. Inspect the photo on the edit page before retrying.",
                    { duration: 10000 },
                  );
                }
              }
              draft.reset();
              onDirty(false);
              onCreated(created);
            } else {
              draft.reset();
              onDirty(false);
            }
          });
        }}
      >
        <fieldset disabled={save.isPending || imageEditing} className="space-y-4">
          <h2 className="seller-listing-title font-display text-2xl">
            <Box aria-hidden="true" />
            Product basics
          </h2>
          <p className="seller-form-intro">
            A clear name, the right category and your price. Start with these essentials.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Product name"
              name="name"
              value={product?.name}
              placeholder="e.g. Dog food"
              required
            />
            <Field
              label="Unit / pack (e.g. 500 g, piece, portion)"
              name="unit"
              value={product?.unit}
              placeholder="e.g. 500 g, piece, portion"
              required
            />
            <label className="block space-y-1 text-sm">
              <span>Description</span>
              <textarea
                name="description"
                defaultValue={product?.description}
                rows={3}
                placeholder="Describe your product, brand and key features"
                className="block w-full rounded-lg border bg-background p-3"
              />
            </label>
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
              placeholder="e.g. 299"
              required
            />
            <Field
              label="MRP ₹ (optional)"
              name="mrp"
              type="number"
              min={0.01}
              step="0.01"
              value={product?.mrp}
              placeholder="e.g. 399"
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
        </fieldset>
        <div className="product-photo-editor">
          {photoEditor}
          {!product && (
            <section className="new-listing-photo" aria-label="Product photo">
              <h3 className="font-semibold">Product photo</h3>
              <p className="my-2 text-sm text-muted-foreground">
                Show buyers what they will receive. Choose a clear product or packaging photo.
              </p>
              {capability.isPending ? (
                <p role="status">Checking photo uploads…</p>
              ) : capability.isError ? (
                <div>
                  <p role="alert">Photo upload availability could not be checked.</p>
                  <Button type="button" variant="outline" onClick={() => void capability.refetch()}>
                    Check photo uploads
                  </Button>
                </div>
              ) : capability.data?.enabled ? (
                <>
                  <label className="block text-sm">
                    Choose product photo
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="mt-2 block w-full"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setPhoto(null);
                        setPhotoError("");
                        if (!file) return;
                        if (!capability.data.types.includes(file.type)) {
                          setPhotoError("Choose a JPEG, PNG or WebP photo.");
                          e.target.value = "";
                          return;
                        }
                        if (
                          !file.size ||
                          file.size > Math.min(capability.data.maxBytes, 5 * 1024 * 1024)
                        ) {
                          setPhotoError("Choose a non-empty photo no larger than 5 MiB.");
                          e.target.value = "";
                          return;
                        }
                        setPhoto(file);
                      }}
                    />
                  </label>
                  {preview && (
                    <div className="mt-3 w-32">
                      <ProductImage
                        src={preview}
                        alt="Selected product photo preview"
                        width={200}
                      />
                    </div>
                  )}
                  {photo && (
                    <div>
                      <p className="mt-2 text-sm">
                        Photo ready. It will upload when you add this product.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        onClick={() => {
                          setPhoto(null);
                          setPhotoError("");
                          if (photoInput.current) photoInput.current.value = "";
                        }}
                      >
                        Remove selected photo
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm">
                  Photo uploads are not configured yet. You can save the listing and add a photo
                  after storage is enabled.
                </p>
              )}
              {photoError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {photoError}
                </p>
              )}
            </section>
          )}
          {!product && (
            <ProductDraftAssistant
              key={photo ? `${photo.name}:${photo.lastModified}:${photo.size}` : "none"}
              file={photo}
              disabled={save.isPending}
              onApply={(suggestion) => {
                for (const name of ["name", "description", "unit"] as const) {
                  const field = formRef.current?.elements.namedItem(name) as
                    HTMLInputElement | HTMLTextAreaElement | null;
                  if (field && !field.value.trim()) field.value = suggestion[name];
                }
                if (
                  !categoryId &&
                  categories.some(
                    (category) =>
                      category.id === suggestion.categoryId &&
                      shop.categoryIds.includes(category.id),
                  )
                )
                  setCategoryId(suggestion.categoryId);
                draft.mark();
                onDirty(true);
              }}
            />
          )}
        </div>
        <fieldset disabled={save.isPending || imageEditing} className="space-y-4">
          <label className="seller-listing-visibility flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
            Active listing
          </label>
          <p className="text-xs text-muted-foreground">
            Optional variants are managed after saving this listing. Each option has its own price,
            stock and details.
          </p>
          <SaveError error={save.error} />
          <div className="seller-listing-actions">
            <Button type="button" variant="ghost" asChild>
              <Link to="/seller/products">Cancel</Link>
            </Button>
            <Button type="submit">
              {save.isPending ? "Saving…" : product ? "Save listing" : "Add product"}
            </Button>
          </div>
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
