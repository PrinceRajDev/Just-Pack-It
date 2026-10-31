import { Check, ShoppingBag, CreditCard, ClipboardCheck, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { id: "bag", label: "Bag", icon: ShoppingBag },
  { id: "details", label: "Details", icon: CreditCard },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "confirmation", label: "Confirmation", icon: PackageCheck },
] as const;

export type CheckoutStep = (typeof steps)[number]["id"];

/** A compact, semantic progress indicator shared by bag and checkout pages. */
export function CheckoutProgress({ current }: { current: CheckoutStep }) {
  const active = steps.findIndex((step) => step.id === current);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Checkout progress">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const complete = index < active;
        const isCurrent = index === active;
        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border",
                complete && "border-primary bg-primary text-primary-foreground",
                isCurrent && "border-primary bg-secondary text-primary",
                !complete && !isCurrent && "border-border bg-card text-muted-foreground",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {complete ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
            </span>
            <span
              className={cn(
                "hidden font-medium sm:inline",
                isCurrent ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span className="h-px min-w-2 flex-1 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
