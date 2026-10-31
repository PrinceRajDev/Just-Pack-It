import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Package, PackageOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { adminWorkspace } from "@/services/admin-workspace";
import type { ModerationProduct } from "@/domain/admin-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ConfirmAction } from "@/components/common/ConfirmAction";
import { Skeleton } from "@/components/ui/skeleton";
import { inr } from "@/lib/image";

export function ProductModeration() {
  const [draft, setDraft] = useState(""),
    [q, setQ] = useState(""),
    [state, setState] = useState("all"),
    [selected, setSelected] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["admin-product-moderation", q, state],
    queryFn: ({ pageParam }) => adminWorkspace.products({ q: q || undefined, state }, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const product = rows.find((p) => p.id === selected);
  return (
    <section className="catalog-panel">
      <header className="catalog-panel-heading">
        <div>
          <h2>
            <Package />
            All-shop product moderation
          </h2>
          <p>
            Blocking prevents new purchases of the listing. Seller price/stock edits cannot remove
            an admin block. Existing orders are unchanged.
          </p>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          Refresh records
        </Button>
      </header>
      <form
        className="catalog-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
        }}
      >
        <label>
          Product name
          <Input
            value={draft}
            maxLength={100}
            placeholder="Search products by name…"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <label>
          Listing status
          <select
            aria-label="Listing status"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            {["all", "active", "blocked", "inactive"].map((s) => (
              <option key={s} value={s}>
                {s === "all"
                  ? "All products"
                  : s === "active"
                    ? "Seller active"
                    : s === "inactive"
                      ? "Seller inactive"
                      : "Blocked"}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Search products</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft("");
            setQ("");
            setState("all");
          }}
        >
          Clear
        </Button>
      </form>
      {query.isError && (
        <div role="alert" className="catalog-error">
          Could not load or refresh listings. Previously loaded records may be outdated.{" "}
          {query.error.message}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry listings
          </Button>
        </div>
      )}
      {query.isPending ? (
        <div role="status" aria-label="Loading listings">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="my-3 h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Product name",
                    "Shop",
                    "Price",
                    "Listing status",
                    "Last admin decision",
                    "Actions",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.name}</b>
                      <small>{p.variantCount} variant options</small>
                    </td>
                    <td>{p.shopName}</td>
                    <td>{inr(p.price)}</td>
                    <td>
                      <span
                        className={
                          p.moderation?.blocked ? "catalog-badge blocked" : "catalog-badge"
                        }
                      >
                        {p.moderation?.blocked ? "Blocked by admin" : "No admin block"}
                      </span>
                      <small>Seller {p.active ? "active" : "inactive"}</small>
                    </td>
                    <td>
                      {p.moderation?.updatedAt
                        ? new Date(p.moderation.updatedAt).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })
                        : "Not recorded"}
                    </td>
                    <td>
                      <Button variant="outline" onClick={() => setSelected(p.id)}>
                        View / moderate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="catalog-product-cards">
            {rows.map((p) => (
              <article key={p.id}>
                <Package />
                <h3>{p.name}</h3>
                <p>
                  {p.shopName} · {inr(p.price)}
                </p>
                <p>
                  {p.moderation?.blocked ? "Blocked by admin" : "No admin block"} · Seller{" "}
                  {p.active ? "active" : "inactive"}
                </p>
                <Button variant="outline" onClick={() => setSelected(p.id)}>
                  View / moderate
                </Button>
              </article>
            ))}
          </div>
          {query.isSuccess && !rows.length && (
            <div className="catalog-empty">
              <PackageOpen size={62} />
              <h3>No matching products</h3>
              <p>Try adjusting your search or filters. Products from all shops will appear here.</p>
            </div>
          )}
        </>
      )}
      {query.hasNextPage && (
        <Button
          disabled={query.isFetching}
          variant="outline"
          onClick={() => void query.fetchNextPage()}
        >
          Load more records
        </Button>
      )}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="catalog-drawer">
          <SheetTitle>Product details</SheetTitle>
          <SheetDescription>
            Authorised listing summary. Moderation changes require confirmation.
          </SheetDescription>
          {product ? (
            <ModerationDetail
              key={`${product.id}:${product.version}`}
              product={product}
              disabled={query.isFetching || query.isError}
            />
          ) : (
            <p>Listing unavailable in this view. Close and refresh records.</p>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
function ModerationDetail({
  product,
  disabled,
}: {
  product: ModerationProduct;
  disabled: boolean;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    client = useQueryClient();
  const submit = async () => {
    if (lock.current || disabled || reason.trim().length < 3) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await adminWorkspace.moderate(product, !product.moderation?.blocked, reason.trim());
      await client.invalidateQueries({ queryKey: ["admin-product-moderation"] });
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["product"] });
      toast.success("Moderation decision saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision not confirmed; refresh.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="catalog-product-detail">
      <Package size={42} />
      <h2>{product.name}</h2>
      <p>{product.shopName}</p>
      <dl>
        <dt>Listing ID</dt>
        <dd>{product.id}</dd>
        <dt>Shop ID</dt>
        <dd>{product.shopId}</dd>
        <dt>Listing price</dt>
        <dd>{inr(product.price)}</dd>
        <dt>Variant options</dt>
        <dd>{product.variantCount}</dd>
        <dt>Seller listing</dt>
        <dd>{product.active ? "Active" : "Inactive"}</dd>
        <dt>Admin moderation</dt>
        <dd>{product.moderation?.blocked ? "Blocked by admin" : "No admin block"}</dd>
      </dl>
      {product.moderation && <p>Last decision: {product.moderation.reason}</p>}
      <p className="text-sm text-muted-foreground">
        Photos, descriptions, categories, MRP, variant details, stock, seller identity and shop
        approval status are not supplied by this moderation API. No availability is inferred.
      </p>
      <label>
        Reason for seller
        <Input
          value={reason}
          minLength={3}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
        />
      </label>
      <ConfirmAction
        title={product.moderation?.blocked ? "Remove this admin block?" : "Block this listing?"}
        description={`Listing: ${product.name} at ${product.shopName}. Reason: ${reason.trim()}. Existing orders remain unchanged.`}
        confirmLabel="Confirm moderation"
        onConfirm={() => void submit()}
      >
        <Button disabled={busy || disabled || reason.trim().length < 3}>
          {busy ? "Saving…" : product.moderation?.blocked ? "Remove admin block" : "Block listing"}
        </Button>
      </ConfirmAction>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
