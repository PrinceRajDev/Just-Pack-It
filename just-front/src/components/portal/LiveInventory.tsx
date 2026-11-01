import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, RefreshCw, Tag, TriangleAlert, Search, Info, Package } from "lucide-react";
import { management } from "@/services/management";
import type { ManagedProduct } from "@/domain/management";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { StockRoomIllustration } from "./StockRoomIllustration";
import { OrderBoxIllustration } from "./OrderBoxIllustration";
import { ProductImage } from "@/components/store/ProductImage";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveError } from "./management-shared";
import { useDraftGuard } from "./useDraftGuard";
import { toast } from "sonner";

const quantity = (p: ManagedProduct) =>
  p.variants?.length ? Math.min(...p.variants.map((v) => v.stock)) : p.stock;
export function LiveInventory() {
  const query = useQuery({
    queryKey: ["seller-products"],
    queryFn: management.products,
    refetchOnWindowFocus: false,
  });
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  if (query.isPending)
    return (
      <div className="seller-stock-loading" role="status" aria-label="Loading stock">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-5 h-24 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
        <span className="sr-only">Loading stock…</span>
      </div>
    );
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const options = query.data.flatMap((p) =>
    p.variants?.length ? p.variants.map((v) => v.stock) : [p.stock],
  );
  const matches = (n: number) =>
    filter === "out" ? n === 0 : filter === "low" ? n > 0 && n <= 5 : true;
  const rows = query.data
    .filter(
      (p) =>
        p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
        (p.variants?.length ? p.variants.some((v) => matches(v.stock)) : matches(p.stock)),
    )
    .sort((a, b) => quantity(a) - quantity(b) || a.name.localeCompare(b.name));
  return (
    <div className="seller-stock-page">
      <header className="seller-stock-hero">
        <div>
          <p className="workspace-eyebrow">Just Pack It · Workspace</p>
          <h1>Stock room</h1>
          <p>Manage quantities here. Use Products to change listing details, photos and prices.</p>
        </div>
        <StockRoomIllustration />
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={17} aria-hidden="true" />
          Refresh stock
        </Button>
      </header>
      <div className="seller-stock-summary">
        <div className="stock-metric stock-metric-total">
          <Boxes aria-hidden="true" />
          <div>
            <strong>{options.length}</strong>
            <p>Stock options</p>
          </div>
        </div>
        <div className="stock-metric stock-metric-low">
          <Tag aria-hidden="true" />
          <div>
            <strong>{options.filter((n) => n > 0 && n <= 5).length}</strong>
            <p>Low stock</p>
          </div>
        </div>
        <div className="stock-metric stock-metric-out">
          <TriangleAlert aria-hidden="true" />
          <div>
            <strong>{options.filter((n) => n === 0).length}</strong>
            <p>Out of stock</p>
          </div>
        </div>
      </div>
      <div className="seller-stock-toolbar">
        <label className="grid gap-1 text-sm">
          Search stock
          <span className="seller-stock-search">
            <Search size={20} aria-hidden="true" />
            <input
              className="rounded-lg border p-3"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product name"
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          Stock status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All stock</option>
            <option value="low">Low stock (1 to 5)</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
      </div>
      <p className="seller-stock-info text-sm text-muted-foreground">
        <Info size={19} aria-hidden="true" />
        Quantities are whole sale units. Variant stock is independent; base stock is never added to
        option totals. Inactive and blocked listings remain visible here.
      </p>
      {!rows.length ? (
        <section className="seller-stock-empty">
          <OrderBoxIllustration />
          <h2 className="font-semibold">
            {query.data.length ? "No stock matches these filters" : "No stock to manage yet"}
          </h2>
          <p className="mt-2 text-sm">
            {query.data.length
              ? "Try another product name or stock status."
              : "Add a listing in Products, then manage its quantities here."}
          </p>
          <Button asChild className="mt-3">
            <Link to="/seller/products">
              <Package size={18} aria-hidden="true" />
              Open Products
            </Link>
          </Button>
        </section>
      ) : (
        <ul className="seller-stock-rows">
          {rows.map((p) => (
            <li key={p.id}>
              <InventoryRow key={`${p.id}:${p.version}`} product={p} />
            </li>
          ))}
        </ul>
      )}
      {query.isSuccess && (
        <p className="seller-stock-updated text-xs text-muted-foreground">
          Last refreshed{" "}
          <time dateTime={new Date(query.dataUpdatedAt).toISOString()}>
            {new Date(query.dataUpdatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          </time>{" "}
          · IST
        </p>
      )}
    </div>
  );
}
function InventoryRow({ product }: { product: ManagedProduct }) {
  const [stock, setStock] = useState(String(product.stock)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [saved, setSaved] = useState(false);
  const lock = useRef(false),
    client = useQueryClient(),
    draft = useDraftGuard();
  const variants = product.variants ?? [];
  return (
    <article className="seller-stock-row">
      {draft.dialog}
      <div className="seller-stock-product">
        <div className="seller-stock-photo">
          <ProductImage src={product.image} alt={product.name} width={100} />
        </div>
        <div>
          <h2 className="font-semibold">{product.name}</h2>
          <p className="text-sm text-muted-foreground">
            {product.unit} · {product.active ? "Active" : "Inactive"}
            {product.moderation?.blocked ? " · Blocked by admin" : ""}
          </p>
          {!variants.length && (
            <span
              className="seller-stock-badge"
              data-state={product.stock === 0 ? "out" : product.stock <= 5 ? "low" : "in"}
            >
              {product.stock === 0 ? "Out of stock" : product.stock <= 5 ? "Low stock" : "In stock"}
            </span>
          )}
        </div>
      </div>
      {variants.length ? (
        <div>
          <ul className="space-y-2 text-sm">
            {variants.map((v) => (
              <li key={v.id} className="flex justify-between gap-4">
                <span>{v.label}</span>
                <strong>
                  {v.stock}{" "}
                  {v.stock === 0 ? "(out of stock)" : v.stock <= 5 ? "(low stock)" : "available"}
                </strong>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/seller/products/$id/edit" params={{ id: product.id }}>
              Manage variant stock
            </Link>
          </Button>
        </div>
      ) : (
        <form
          className="seller-stock-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            const value = Number(stock);
            if (
              stock.trim() === "" ||
              !Number.isSafeInteger(value) ||
              value < 0 ||
              value > 100000000
            ) {
              setError(new Error("Enter a whole stock quantity from 0 to 100000000."));
              return;
            }
            lock.current = true;
            setBusy(true);
            setError(null);
            setSaved(false);
            try {
              await management.inventory(product, value);
              draft.reset();
              setSaved(true);
              toast.success("Stock saved");
              for (const key of [
                "seller-products",
                "seller-product",
                "seller-dashboard",
                "products",
                "product",
                "cart-review",
                "checkout-review",
              ])
                void client.invalidateQueries({ queryKey: [key] });
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause
                  : new Error("Stock was not saved. Refresh before retrying."),
              );
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <label className="grid gap-1 text-sm">
            Available quantity
            <input
              aria-label={`Stock for ${product.name}`}
              type="number"
              min={0}
              max={100000000}
              step={1}
              required
              value={stock}
              disabled={busy}
              onChange={(e) => {
                setStock(e.target.value);
                setSaved(false);
                draft.mark();
              }}
            />
          </label>
          <Button type="submit" disabled={busy || stock === String(product.stock)}>
            {busy ? "Saving…" : "Save stock"}
          </Button>
          <div className="seller-stock-feedback">
            <SaveError error={error} />
            {saved && <p role="status">Stock saved.</p>}
          </div>
        </form>
      )}
    </article>
  );
}
