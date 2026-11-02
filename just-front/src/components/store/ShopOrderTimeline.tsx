import { UiText, UiAttributes } from "@/lib/i18n/Language";
import type { SubOrder } from "@/domain/types";
export function ShopOrderTimeline({
  sub,
  paymentPending = false,
}: {
  sub: SubOrder;
  paymentPending?: boolean;
}) {
  if (sub.status === "cancelled")
    return (
      <p role="status" className="rounded-lg border p-3 text-sm">
        This shop’s order was cancelled. No further fulfilment steps are expected. Refund status,
        when applicable, is shown separately.
      </p>
    );
  if (sub.status === "delivery_failed")
    return (
      <p role="status" className="rounded-lg border p-3 text-sm">
        Delivery was reported unsuccessful. Review this shop’s order and use Help to report an
        issue.
      </p>
    );
  if (paymentPending)
    return (
      <p role="status" className="rounded-lg border p-3 text-sm">
        Awaiting verified online payment. Shop acceptance and preparation have not been confirmed
        here.
      </p>
    );
  const steps =
    sub.fulfilment === "pickup"
      ? [
          { status: "placed", label: "Order placed" },
          { status: "accepted", label: "Shop accepted" },
          { status: "preparing", label: "Preparing" },
          { status: "ready", label: "Ready for collection" },
          { status: "delivered", label: "Collected" },
        ]
      : [
          { status: "placed", label: "Order placed" },
          { status: "accepted", label: "Shop accepted" },
          { status: "preparing", label: "Preparing" },
          { status: "ready", label: "Ready" },
          ...(sub.fulfilment === "platform_delivery"
            ? [{ status: "picked_up", label: "Picked up" }]
            : []),
          { status: "out_for_delivery", label: "Out for delivery" },
          { status: "delivered", label: "Delivered" },
        ];
  const index = steps.findIndex((step) => step.status === sub.status);
  return (
    <div className="space-y-2">
      <UiAttributes>
        <ol
          aria-label={`Order progress for ${sub.shopName ?? "this shop"}`}
          className="grid gap-2 sm:grid-cols-2"
        >
          {steps.map((step, i) => (
            <li
              key={step.status}
              aria-current={i === index ? "step" : undefined}
              className={`rounded-lg border p-3 text-sm ${i === index ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}
            >
              <span aria-hidden>{i < index ? "✓ " : `${i + 1}. `}</span>
              <UiText>{step.label}</UiText>
              <span className="ml-2 text-xs text-muted-foreground">
                {i === index ? "Current" : i < index ? "Passed" : "Upcoming"}
              </span>
            </li>
          ))}
        </ol>
      </UiAttributes>
      <p className="text-xs text-muted-foreground">
        Progress follows the latest shop status. Individual step timestamps and arrival estimates
        are not supplied.
      </p>
      {sub.updatedAt && Number.isFinite(Date.parse(sub.updatedAt)) && (
        <p className="text-xs text-muted-foreground">
          Shop status updated:{" "}
          <time dateTime={sub.updatedAt}>
            {new Date(sub.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          </time>{" "}
          <UiText>{"· India time"}</UiText>
        </p>
      )}
    </div>
  );
}
