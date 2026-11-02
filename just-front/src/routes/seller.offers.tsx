import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useSeller } from "@/stores/seller";
import { inr } from "@/lib/image";

export const Route = createFileRoute("/seller/offers")({ component: Offers });

function Offers() {
  const { products, updateProduct } = useSeller();
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [price, setPrice] = useState("");
  const [until, setUntil] = useState("");
  const withOffer = products.filter((p) => p.offer);
  const target = products.find((p) => p.id === pid);
  const err =
    target && price
      ? Number(price) >= (target.mrp ?? target.price)
        ? "Offer price must be lower than the current price"
        : Number(price) <= 0
          ? "Enter a valid price"
          : ""
      : "";

  return (
    <>
      <UiAttributes>
        <PortalHeader
          title="Offers"
          sub="Discounts show on your products until the end date."
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="citrus">New offer</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create an offer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="op">Product</Label>
                    <select
                      id="op"
                      value={pid}
                      onChange={(e) => setPid(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
                    >
                      <option value="">Choose…</option>
                      {products
                        .filter((p) => !p.archived)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="opr">Offer price (₹)</Label>
                    <Input
                      id="opr"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="mt-1"
                    />
                    {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
                    {target && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Current: {inr(target.price)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="ou">Valid until</Label>
                    <Input
                      id="ou"
                      type="date"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={!target || !price || !until || !!err}
                    onClick={() => {
                      const mrp = target!.mrp ?? target!.price;
                      updateProduct(target!.id, {
                        mrp,
                        price: Number(price),
                        offer: {
                          label: `${Math.round((1 - Number(price) / mrp) * 100)}% off`,
                          validUntil: new Date(until).toISOString(),
                        },
                      });
                      toast.success("Offer created (demo)");
                      setOpen(false);
                      setPid("");
                      setPrice("");
                      setUntil("");
                    }}
                  >
                    Create offer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />
      </UiAttributes>
      <ul className="divide-y divide-border border-y border-border">
        {withOffer.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">No active offers.</li>
        )}
        {withOffer.map((p) => {
          const expired = new Date(p.offer!.validUntil) < new Date();
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-4 py-4 text-sm">
              <span className="min-w-0 flex-1 font-medium">{p.name}</span>
              <span className="tabular-nums">
                {inr(p.price)}{" "}
                <span className="text-muted-foreground line-through">{p.mrp && inr(p.mrp)}</span>
              </span>
              <span className="label-stamp">
                <UiText>{p.offer!.label}</UiText>
              </span>
              <span className="text-muted-foreground">
                till {new Date(p.offer!.validUntil).toLocaleDateString("en-IN")}
              </span>
              <UiAttributes>
                <StatusBadge
                  status={expired ? "archived" : "active"}
                  label={expired ? "Expired" : "Running"}
                />
              </UiAttributes>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  updateProduct(p.id, {
                    offer: undefined,
                    price: p.mrp ?? p.price,
                    mrp: undefined,
                  });
                  toast("Offer ended");
                }}
              >
                End
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
