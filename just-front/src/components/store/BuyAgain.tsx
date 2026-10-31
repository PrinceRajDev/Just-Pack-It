import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Order } from "@/domain/types";
import type { ReorderPlan } from "@/lib/reorder";
import { reviewReorder } from "@/services/reorder";
import { useCart } from "@/stores/cart";
import { useLocationArea } from "@/stores/location";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
export function BuyAgain({ order }: { order: Order }) {
  const { lines, addReviewed, ready } = useCart();
  const { area, gps } = useLocationArea();
  const [review, setReview] = useState<{ scope: string; plan: ReorderPlan } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const scope = JSON.stringify({ area: area?.id, gps, lines, order });
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const valid = review?.scope === scope;
  async function check(confirm = false) {
    if (!area || lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const plan = await reviewReorder(order, area.id, Object.values(lines));
      if (currentScope.current !== scope) {
        setMessage("Your bag, area or order changed. Check again.");
        return;
      }
      if (confirm && valid && JSON.stringify(review.plan) === JSON.stringify(plan)) {
        const items = plan
          .filter((item) => item.qty > 0)
          .map((item) => ({ productId: item.productId, variantId: item.variantId, qty: item.qty }));
        addReviewed(items);
        setReview(null);
        setMessage(`${items.length} available item lines added. Review your bag before checkout.`);
      } else {
        setReview({ scope, plan });
        if (confirm)
          setMessage("Availability or prices changed. Review the updated list before adding.");
      }
    } catch {
      setReview(null);
      setMessage("Could not check current items. Nothing was added. Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-label="Buy again"
    >
      <h2 className="font-display text-xl">Buy again</h2>
      <p className="text-sm text-muted-foreground">
        Same shop and exact options, at current prices. Existing bag items stay. Delivery charges
        and minimums are reviewed at checkout.
      </p>
      {!area && <p role="status">Choose your area in the header to check these items.</p>}
      <Button variant="outline" disabled={!area || !ready || busy} onClick={() => void check()}>
        {busy ? "Checking current items…" : "Check items to buy again"}
      </Button>
      {review && !valid && <p role="status">Your bag or area changed. Check items again.</p>}
      {valid && (
        <>
          <ul className="divide-y divide-border">
            {review.plan.map((item) => (
              <li className="py-2 text-sm" key={`${item.productId}:${item.variantId ?? ""}`}>
                <p className="font-semibold">
                  {item.name}
                  {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                </p>
                <p>
                  {item.shopName} · Requested {item.requested} · Add {item.qty}
                </p>
                {item.price !== undefined && (
                  <p>
                    Current unit price {inr(item.price)}
                    {item.oldPrice !== item.price && item.oldPrice !== undefined
                      ? ` (previously ${inr(item.oldPrice)})`
                      : ""}
                  </p>
                )}
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
          <Button
            disabled={busy || !review.plan.some((item) => item.qty > 0)}
            onClick={() => void check(true)}
          >
            Add available items to bag
          </Button>
          <p className="text-sm text-muted-foreground">
            Availability is checked again when adding. Stock is not reserved.
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <Link to="/cart" className="ml-3 inline-block text-sm underline">
        Review your bag
      </Link>
    </section>
  );
}
