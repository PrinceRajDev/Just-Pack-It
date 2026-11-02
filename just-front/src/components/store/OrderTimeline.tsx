import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { Check, X } from "lucide-react";
import type { SubOrder, SubOrderStatus } from "@/domain/types";
import { cn } from "@/lib/utils";

const steps: { key: SubOrderStatus; label: string }[] = [
  { key: "placed", label: "Order confirmed" },
  { key: "accepted", label: "Shop accepted" },
  { key: "preparing", label: "Being packed" },
  { key: "picked_up", label: "Picked up" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];
const order: SubOrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
  "out_for_delivery",
  "delivered",
];

export function OrderTimeline({ sub }: { sub: SubOrder }) {
  const failed = sub.status === "cancelled" || sub.status === "delivery_failed";
  const idx = failed ? 0 : order.indexOf(sub.status);
  const visible =
    sub.fulfilment === "pickup" ? steps.filter((s) => s.key !== "out_for_delivery") : steps;

  if (failed) {
    return (
      <div className="flex items-start gap-3 border-l-2 border-destructive pl-4">
        <X className="mt-0.5 size-5 text-destructive" aria-hidden />
        <div>
          <p className="font-medium">
            <UiText>
              {sub.status === "cancelled"
                ? "This part was cancelled"
                : "Delivery couldn't be completed"}
            </UiText>
          </p>
          <p className="text-sm text-muted-foreground">
            <UiText>
              {sub.status === "cancelled"
                ? "Any prepaid amount is refunded to the original method in 5 to 7 working days."
                : "Our team will contact you to reschedule or refund."}
            </UiText>
          </p>
        </div>
      </div>
    );
  }

  return (
    <UiAttributes>
      <ol className="order-timeline relative space-y-0" aria-label="Shop order progress">
        {visible.map((s, i) => {
          const done = order.indexOf(s.key) <= idx;
          const current =
            order.indexOf(s.key) <= idx &&
            (visible[i + 1] ? order.indexOf(visible[i + 1].key) > idx : true);
          return (
            <li
              key={s.key}
              className="flex gap-3 pb-5 last:pb-0"
              aria-current={current ? "step" : undefined}
            >
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border-2",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {done && <Check className="size-3.5" />}
                </span>
                {i < visible.length - 1 && (
                  <span className={cn("mt-1 w-0.5 flex-1", done ? "bg-primary" : "bg-border")} />
                )}
              </div>
              <p
                className={cn(
                  "text-sm",
                  current ? "font-semibold" : done ? "" : "text-muted-foreground",
                )}
              >
                <UiText>{s.label}</UiText>
                {current && sub.eta && (
                  <span className="ml-2 text-xs text-muted-foreground">ETA {sub.eta}</span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </UiAttributes>
  );
}
