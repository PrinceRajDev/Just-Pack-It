import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { StoreLayout, PageTitle } from "@/components/store/StoreLayout";
import {
  Totals,
  useBagGroups,
  BagIssues,
  ShopCheckoutDetails,
} from "@/components/store/BagSummary";
import { fulfilmentLabel } from "@/components/store/ShopMark";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { addresses } from "@/mocks/data";
import { orders } from "@/services/orders";
import { ApiError } from "@/lib/api/client";
import { useCart } from "@/stores/cart";
import { inr } from "@/lib/image";
import type { PaymentMethod } from "@/domain/types";
import { cn } from "@/lib/utils";
import { CheckoutProgress } from "@/components/store/CheckoutProgress";
import { isDemoMode } from "@/lib/config";
import { LiveCart } from "@/components/store/LiveCart";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Just Pack It" },
      {
        name: "description",
        content: "Choose an address and payment method, then review your order.",
      },
      { property: "og:title", content: "Checkout — Just Pack It" },
      { property: "og:description", content: "Review and place your order." },
    ],
  }),
  component: isDemoMode ? Checkout : LiveCheckout,
});
function LiveCheckout() {
  return <LiveCart checkout />;
}

const payments: { id: PaymentMethod; label: string; note: string; available: boolean }[] = [
  {
    id: "cod",
    label: "Cash / UPI on delivery",
    note: "Pay the shop or rider when it arrives",
    available: true,
  },
  {
    id: "upi",
    label: "UPI (pay now)",
    note: "Needs payment gateway — not connected yet",
    available: false,
  },
  {
    id: "card",
    label: "Debit / credit card",
    note: "Needs payment gateway — not connected yet",
    available: false,
  },
];

function Checkout() {
  const bag = useBagGroups();
  const { lines, clear } = useCart();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [addressId, setAddressId] = useState(addresses[0].id);
  const [payment, setPayment] = useState<PaymentMethod>("cod");
  const [step, setStep] = useState<"details" | "review">("details");

  const place = useMutation({
    mutationFn: () => {
      if (!bag.canCheckout)
        throw new ApiError(
          "Resolve the items listed in your bag before placing an order.",
          409,
          "BAG_NOT_READY",
        );
      return orders.place({ addressId, paymentMethod: payment, items: Object.values(lines) });
    },
    onSuccess: (order) => {
      clear();
      qc.invalidateQueries({ queryKey: ["orders"] });
      navigate({ to: "/orders/$id", params: { id: order.id }, search: { placed: true } });
    },
  });

  if (bag.groups.length === 0) {
    return (
      <StoreLayout>
        <PageTitle title="Checkout" />
        <div className="mx-auto max-w-7xl px-4">
          <BagIssues issues={bag.issues} />
          {bag.issues.length > 0 && (
            <Link to="/cart" className="text-primary underline">
              Review your bag
            </Link>
          )}
          <EmptyState
            title="Nothing to check out"
            action={
              <Button asChild>
                <Link to="/">Browse shops</Link>
              </Button>
            }
          />
        </div>
      </StoreLayout>
    );
  }
  const addr = addresses.find((a) => a.id === addressId)!;

  return (
    <StoreLayout>
      <PageTitle
        eyebrow={step === "details" ? "Step 1 of 2" : "Step 2 of 2"}
        title={step === "details" ? "Delivery & payment" : "Review your order"}
      >
        <div className="mt-5 max-w-xl">
          <CheckoutProgress current={step === "details" ? "details" : "review"} />
        </div>
      </PageTitle>
      <div className="checkout-page-content mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <BagIssues issues={bag.issues} />
          {bag.issues.length > 0 && (
            <Link to="/cart" className="mb-6 inline-block text-primary underline">
              Review items in your bag
            </Link>
          )}
          {step === "details" ? (
            <div className="space-y-10">
              <section aria-label="Shop charges and requirements" className="space-y-3">
                <h2 className="font-display text-2xl">Each shop's charges</h2>
                <p className="text-sm text-muted-foreground">
                  Delivery is estimated per shop. Minimum-order requirements are shown when
                  provided.
                </p>
                {bag.groups.map((g) => (
                  <div
                    key={g.shop.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <h3 className="px-4 py-3 font-semibold">
                      {g.shop.name} · {fulfilmentLabel[g.fulfilment]}
                    </h3>
                    <ShopCheckoutDetails group={g} />
                  </div>
                ))}
              </section>
              <fieldset>
                <legend className="font-display text-2xl">Deliver to</legend>
                <RadioGroup
                  value={addressId}
                  onValueChange={setAddressId}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  {addresses.map((a) => (
                    <Label
                      key={a.id}
                      htmlFor={a.id}
                      className={cn(
                        "flex cursor-pointer gap-3 border p-4 font-normal",
                        addressId === a.id
                          ? "border-primary bg-secondary"
                          : "border-border bg-card",
                      )}
                    >
                      <RadioGroupItem value={a.id} id={a.id} className="mt-1" />
                      <span>
                        <span className="block font-semibold">{a.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {a.line1}, {a.locality}, {a.city} {a.pincode}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                <Link
                  to="/account"
                  search={{ tab: "addresses" }}
                  className="mt-3 inline-block text-sm text-primary hover:underline"
                >
                  Manage addresses
                </Link>
              </fieldset>
              <fieldset>
                <legend className="font-display text-2xl">Payment</legend>
                <RadioGroup
                  value={payment}
                  onValueChange={(v) => setPayment(v as PaymentMethod)}
                  className="mt-4 space-y-2"
                >
                  {payments.map((p) => (
                    <Label
                      key={p.id}
                      htmlFor={`pay-${p.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border p-4 font-normal",
                        payment === p.id ? "border-primary bg-secondary" : "border-border bg-card",
                        !p.available && "opacity-60",
                      )}
                    >
                      <RadioGroupItem
                        value={p.id}
                        id={`pay-${p.id}`}
                        disabled={!p.available}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-semibold">{p.label}</span>
                        <span className="text-sm text-muted-foreground">{p.note}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border border-border bg-card p-4 text-sm">
                <p className="label-stamp text-muted-foreground">Delivering to · {addr.label}</p>
                <p className="mt-1">
                  {addr.line1}, {addr.locality}, {addr.city} {addr.pincode}
                </p>
                <p className="label-stamp mt-4 text-muted-foreground">Payment</p>
                <p className="mt-1">{payments.find((p) => p.id === payment)?.label}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Your order will be split into {bag.groups.length} shop order
                {bag.groups.length > 1 ? "s" : ""}. Each is accepted, packed and delivered
                separately.
              </p>
              {bag.groups.map((g, i) => (
                <section key={g.shop.id} className="border border-border bg-card">
                  <header className="flex flex-wrap justify-between gap-2 border-b border-border px-4 py-3">
                    <span className="font-display text-lg">
                      Part {i + 1} · {g.shop.name}
                    </span>
                    <span className="label-stamp text-muted-foreground">
                      {fulfilmentLabel[g.fulfilment]}
                    </span>
                  </header>
                  <ul className="divide-y divide-border text-sm">
                    {g.items.map(({ product, variantId, variantLabel, unitPrice, qty }) => (
                      <li
                        key={`${product.id}-${variantId ?? "base"}`}
                        className="flex justify-between gap-4 px-4 py-2"
                      >
                        <span className="min-w-0 truncate">
                          {qty} × {product.name}
                          {variantLabel ? ` · ${variantLabel}` : ""}
                        </span>
                        <span className="tabular-nums">{inr(unitPrice * qty)}</span>
                      </li>
                    ))}
                  </ul>
                  <ShopCheckoutDetails group={g} />
                </section>
              ))}
              {place.isError && (
                <div
                  role="alert"
                  className="border border-destructive/40 bg-destructive/5 p-4 text-sm"
                >
                  <p className="font-semibold text-destructive">Order not placed</p>
                  <p className="mt-1">
                    {place.error instanceof ApiError
                      ? place.error.message
                      : "Something went wrong. Nothing was charged."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <aside className="lg:col-span-4">
          <div className="sticky top-40 border border-border bg-card p-6">
            <Totals
              itemsTotal={bag.itemsTotal}
              delivery={bag.delivery}
              savings={bag.savings}
              total={bag.total}
            />
            {step === "details" ? (
              <Button
                variant="citrus"
                size="lg"
                className="mt-6 w-full"
                onClick={() => setStep("review")}
                disabled={!bag.canCheckout}
              >
                Review order
              </Button>
            ) : (
              <div className="mt-6 space-y-2">
                <Button
                  variant="citrus"
                  size="lg"
                  className="w-full"
                  disabled={place.isPending || !bag.canCheckout}
                  onClick={() => place.mutate()}
                >
                  {place.isPending ? (
                    <>
                      <Loader2 className="animate-spin" /> Placing order…
                    </>
                  ) : place.isError ? (
                    "Try again"
                  ) : (
                    `Place order · ${inr(bag.total)}`
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("details")}
                  disabled={place.isPending}
                >
                  Back
                </Button>
              </div>
            )}
            <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-success" /> Prices and availability are
              confirmed server-side when the order is placed.
            </p>
          </div>
        </aside>
      </div>
    </StoreLayout>
  );
}
