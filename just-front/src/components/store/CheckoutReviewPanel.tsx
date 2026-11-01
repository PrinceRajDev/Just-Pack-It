import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { reviewCheckout } from "@/services/checkout-review";
import type { CartLine, FulfilmentMethod } from "@/domain/types";
import { inr } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { CodOrderAction } from "./CodOrderAction";
import { OnlineOrderAction } from "./OnlineOrderAction";
export function CheckoutReviewPanel({
  userId,
  areaId,
  addressId,
  addressVersion,
  lines,
  fulfilments,
}: {
  userId: string;
  areaId: string;
  addressId: string;
  addressVersion: number;
  lines: CartLine[];
  fulfilments: { shopId: string; method: FulfilmentMethod }[];
}) {
  const [payment, setPayment] = useState<"cod" | "razorpay">("cod");
  const items = lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty }));
  const check = useQuery({
    queryKey: ["checkout-review", userId, areaId, addressId, addressVersion, items, fulfilments],
    queryFn: ({ signal }) =>
      reviewCheckout(areaId, addressId, addressVersion, lines, fulfilments, signal),
    retry: false,
    staleTime: 0,
  });
  if (check.isPending)
    return <p role="status">Reviewing your selected shops, items and methods…</p>;
  if (check.isError)
    return (
      <div role="alert">
        <p>Couldn't complete the review. Your bag and selections are kept.</p>
        <Button variant="outline" onClick={() => void check.refetch()}>
          Retry bill
        </Button>
      </div>
    );
  if (check.data.addressVersion !== addressVersion)
    return <p role="alert">Your address changed. Reload addresses before reviewing again.</p>;
  const issues = [
    ...check.data.issues,
    ...check.data.lines.flatMap((line) =>
      line.issues.map((issue) => ({
        ...issue,
        message: `${line.product?.name ?? "Item"}: ${issue.message}`,
      })),
    ),
    ...check.data.shops.flatMap((group) =>
      group.issues.map((issue) => ({ ...issue, message: `${group.shop.name}: ${issue.message}` })),
    ),
    ...check.data.fulfilments.flatMap((selection) =>
      selection.issues.map((issue) => ({
        ...issue,
        message: `${check.data.shops.find((group) => group.shop.id === selection.shopId)?.shop.name ?? "Shop"}: ${issue.message}`,
      })),
    ),
  ];
  return (
    <section
      className="space-y-3 rounded-lg border border-primary/20 bg-secondary/40 p-4"
      aria-labelledby="full-review-title"
    >
      <h3 id="full-review-title" className="font-semibold">
        Bill details
      </h3>
      <p>Items: {inr(check.data.itemsSubtotal)}</p>
      <ul className="space-y-2 text-sm">
        {check.data.fulfilments.map((selection) => (
          <li key={selection.shopId}>
            {check.data.shops.find((group) => group.shop.id === selection.shopId)?.shop.name ??
              "Shop"}{" "}
            · Delivery: {selection.listedFee === null ? "Not verified" : inr(selection.listedFee)}
          </li>
        ))}
      </ul>
      <ul className="space-y-2 text-sm text-muted-foreground" aria-label="Review issues">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`}>{issue.message}</li>
        ))}
      </ul>
      <Button variant="outline" disabled={check.isFetching} onClick={() => void check.refetch()}>
        Refresh bill
      </Button>
      {check.data.checkoutAvailable &&
      check.data.grandTotal !== null &&
      Number.isFinite(check.data.grandTotal) &&
      !!check.data.paymentMethods?.length &&
      check.data.pricingPolicy === "tax_inclusive_listed_delivery_no_extras_v1" &&
      !issues.length &&
      !check.isFetching ? (
        <>
          <p className="font-semibold">
            {(check.data.paymentMethods?.includes(payment)
              ? payment
              : check.data.paymentMethods?.[0]) === "razorpay"
              ? "Payable online"
              : "Payable on delivery / collection"}
            : {inr(check.data.grandTotal)}
          </p>
          <p className="text-sm">Includes tax. No extra platform fee.</p>
          <label className="block text-sm">
            Payment method{" "}
            <select
              className="ml-2 rounded border bg-background p-2"
              value={
                check.data.paymentMethods?.includes(payment)
                  ? payment
                  : check.data.paymentMethods?.[0]
              }
              onChange={(event) => setPayment(event.target.value as "cod" | "razorpay")}
            >
              {check.data.paymentMethods?.map((method) => (
                <option key={method} value={method}>
                  {method === "cod" ? "Cash on delivery / collection" : "Pay online with Razorpay"}
                </option>
              ))}
            </select>
          </label>
          {(check.data.paymentMethods?.includes(payment)
            ? payment
            : check.data.paymentMethods?.[0]) === "razorpay" ? (
            <OnlineOrderAction
              userId={userId}
              input={{
                areaId,
                addressId,
                addressVersion,
                items,
                fulfilments,
                expectedTotal: check.data.grandTotal,
                paymentMethod: "razorpay",
              }}
            />
          ) : (
            <CodOrderAction
              key={JSON.stringify([items, fulfilments, check.data.grandTotal, addressVersion])}
              userId={userId}
              input={{
                areaId,
                addressId,
                addressVersion,
                items,
                fulfilments,
                expectedTotal: check.data.grandTotal,
                paymentMethod: "cod",
              }}
              onReset={() => void check.refetch()}
            />
          )}
        </>
      ) : (
        <Button disabled>Ordering is not available yet</Button>
      )}
      <p className="text-xs text-muted-foreground">
        Stock is not reserved by this review. No order or payment has been created by reviewing.
      </p>
    </section>
  );
}
