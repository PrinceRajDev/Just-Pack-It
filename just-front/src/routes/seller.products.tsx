import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ProductImage } from "@/components/store/ProductImage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSeller, LOW_STOCK } from "@/stores/seller";
import { inr } from "@/lib/image";
import { EmptyState } from "@/components/common/states";
import { listingStock } from "@/lib/seller-product";

export const Route = createFileRoute("/seller/products")({ component: Products });

function Products() {
  const match = useMatchRoute();
  const { products, updateProduct } = useSeller();
  const [showArchived, setShowArchived] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  if (
    match({ to: "/seller/products/new" }) ||
    match({ to: "/seller/products/$id/edit", fuzzy: true })
  )
    return <Outlet />;
  const list = products.filter((p) => !!p.archived === showArchived);

  const bulk = (patch: { hidden?: boolean; archived?: boolean }, msg: string) => {
    sel.forEach((id) => updateProduct(id, patch));
    toast.success(`${sel.length} products ${msg}`);
    setSel([]);
  };

  return (
    <>
      <PortalHeader
        title="Products"
        sub={`${products.filter((p) => !p.archived).length} live listings`}
        actions={
          <Button asChild variant="citrus">
            <Link to="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <button
          onClick={() => setShowArchived(false)}
          className={
            !showArchived ? "font-semibold underline underline-offset-4" : "text-muted-foreground"
          }
        >
          Active
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={
            showArchived ? "font-semibold underline underline-offset-4" : "text-muted-foreground"
          }
        >
          Archived
        </button>
        {sel.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span>{sel.length} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulk({ hidden: true }, "marked unavailable")}
            >
              Mark unavailable
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulk({ hidden: false }, "made available")}
            >
              Make available
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                bulk({ archived: !showArchived }, showArchived ? "restored" : "archived")
              }
            >
              {showArchived ? "Restore" : "Archive"}
            </Button>
          </div>
        )}
      </div>
      <div className="seller-product-table overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm" aria-label="Shop products">
          <thead className="border-b border-border text-left">
            <tr className="label-stamp text-muted-foreground">
              <th className="w-10 p-3">
                <Checkbox
                  aria-label="Select all"
                  checked={sel.length === list.length && list.length > 0}
                  onCheckedChange={(v) => setSel(v ? list.map((p) => p.id) : [])}
                />
              </th>
              <th className="p-3">Product</th>
              <th className="p-3">Price</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((p) => (
              <tr key={p.id}>
                <td data-label="Select" className="p-3">
                  <Checkbox
                    aria-label={`Select ${p.name}`}
                    checked={sel.includes(p.id)}
                    onCheckedChange={(v) =>
                      setSel((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))
                    }
                  />
                </td>
                <td data-label="Product" className="p-3">
                  <div className="flex items-center gap-3">
                    <ProductImage src={p.image} alt="" width={80} className="size-10 rounded-sm" />
                    <Link
                      to="/seller/products/$id/edit"
                      params={{ id: p.id }}
                      className="line-clamp-1 max-w-xs hover:text-primary hover:underline"
                    >
                      {p.name}
                      <span className="block text-xs text-muted-foreground">{p.unit}</span>
                    </Link>
                  </div>
                </td>
                <td data-label="Price" className="p-3 tabular-nums">
                  {inr(p.price)}
                  {p.mrp && (
                    <span className="block text-xs text-muted-foreground line-through">
                      {inr(p.mrp)}
                    </span>
                  )}
                </td>
                <td data-label="Stock" className="p-3 tabular-nums">
                  {p.variants?.length
                    ? `${p.variants.reduce((n, v) => n + v.stock, 0)} across ${p.variants.length} options`
                    : p.stock}
                </td>
                <td data-label="Status" className="p-3">
                  <StatusBadge
                    status={
                      p.archived
                        ? "archived"
                        : p.hidden
                          ? "unavailable"
                          : listingStock(p) === 0
                            ? "out"
                            : listingStock(p) <= LOW_STOCK
                              ? "low"
                              : "active"
                    }
                  />
                </td>
                <td data-label="Actions" className="p-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="rounded-md p-2 hover:bg-muted"
                      aria-label={`Actions for ${p.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/seller/products/$id/edit" params={{ id: p.id }}>
                          Edit product
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateProduct(p.id, { hidden: !p.hidden })}>
                        {p.hidden ? "Make available" : "Mark unavailable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!!p.variants?.length}
                        onClick={() => updateProduct(p.id, { stock: p.stock + 10 })}
                      >
                        Add 10 to stock
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          updateProduct(p.id, { archived: !p.archived });
                          toast(p.archived ? "Restored" : "Archived");
                        }}
                      >
                        {p.archived ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <EmptyState
            title={`No ${showArchived ? "archived" : "active"} products`}
            body={
              showArchived
                ? "Archived listings will appear here."
                : "Add your first listing to start building your shop catalogue."
            }
            action={
              !showArchived ? (
                <Button asChild>
                  <Link to="/seller/products/new">Add product</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </>
  );
}
