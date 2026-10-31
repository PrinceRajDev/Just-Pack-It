import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Switch } from "@/components/ui/switch";
import { useSeller, LOW_STOCK } from "@/stores/seller";
import { listingStock } from "@/lib/seller-product";

export const Route = createFileRoute("/seller/inventory")({ component: Inventory });

function Inventory() {
  const { products, updateProduct } = useSeller();
  const list = [...products.filter((p) => !p.archived)].sort(
    (a, b) => listingStock(a) - listingStock(b),
  );
  return (
    <>
      <PortalHeader title="Stock" sub="Lowest stock first. Changes apply instantly in the demo." />
      <ul className="workspace-stock-list divide-y divide-border border-y border-border">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.unit}</p>
            </div>
            {listingStock(p) <= LOW_STOCK && (
              <StatusBadge status={listingStock(p) === 0 ? "out" : "low"} />
            )}
            {!!p.variants?.length && (
              <span className="text-sm">
                {listingStock(p)} across {p.variants.length} options
              </span>
            )}
            <div
              className={`${p.variants?.length ? "hidden" : "flex"} items-center rounded-md border border-border bg-card`}
              role="group"
              aria-label={`Stock for ${p.name}`}
            >
              <button
                className="flex size-11 items-center justify-center hover:bg-muted"
                onClick={() => updateProduct(p.id, { stock: Math.max(0, p.stock - 1) })}
                aria-label="Decrease"
              >
                <Minus className="size-4" />
              </button>
              <input
                type="number"
                min={0}
                value={p.stock}
                onChange={(e) =>
                  updateProduct(p.id, {
                    stock: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                  })
                }
                className="h-11 w-16 border-x border-border bg-transparent text-center tabular-nums"
                aria-label="Stock count"
              />
              <button
                className="flex size-11 items-center justify-center hover:bg-muted"
                onClick={() => updateProduct(p.id, { stock: p.stock + 1 })}
                aria-label="Increase"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Link
              to="/seller/products/$id/edit"
              params={{ id: p.id }}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-primary"
            >
              {p.variants?.length ? "Manage variant stock" : "Edit listing"}
            </Link>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!p.hidden}
                onCheckedChange={(v) => {
                  updateProduct(p.id, { hidden: !v });
                  toast(v ? "Listed" : "Marked unavailable");
                }}
              />
              Available
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
