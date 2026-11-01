import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, RefreshCw } from "lucide-react";
import { management } from "@/services/management";
import type { ManagedProduct } from "@/domain/management";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { PortalHeader } from "./PortalShell";
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
  if (query.isPending) return <p role="status">Loading stock…</p>;
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
      <PortalHeader
        title="Stock room"
        sub="Manage quantities here. Use Products to change listing details, photos and prices."
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={17} aria-hidden="true" />
            Refresh stock
          </Button>
        }
      />
      <div className="seller-stock-summary">
        <Boxes aria-hidden="true" />
        <span>
          <strong>{options.length}</strong> stock options
        </span>
        <span>
          <strong>{options.filter((n) => n > 0 && n <= 5).length}</strong> low stock
        </span>
        <span>
          <strong>{options.filter((n) => n === 0).length}</strong> out of stock
        </span>
      </div>
      <div className="seller-orders-toolbar">
        <label className="grid gap-1 text-sm">
          Search stock
          <input
            className="rounded-lg border p-3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product name"
          />
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
      <p className="mb-4 text-sm text-muted-foreground">
        Quantities are whole sale units. Variant stock is independent; base stock is never added to
        option totals. Inactive and blocked listings remain visible here.
      </p>
      {!rows.length ? (
        <section className="seller-orders-feedback">
          <h2 className="font-semibold">
            {query.data.length ? "No stock matches these filters" : "No stock to manage yet"}
          </h2>
          <p className="mt-2 text-sm">
            {query.data.length
              ? "Try another product name or stock status."
              : "Add a listing in Products, then manage its quantities here."}
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/seller/products">Open Products</Link>
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
      <div>
        <h2 className="font-semibold">{product.name}</h2>
        <p className="text-sm text-muted-foreground">
          {product.unit} · {product.active ? "Active" : "Inactive"}
          {product.moderation?.blocked ? " · Blocked by admin" : ""}
        </p>
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
