import type { ManagedShop } from "@/domain/management";
export function ShopReviewNotice({ shop }: { shop: ManagedShop }) {
  if (!shop.review) return null;
  const date = new Date(shop.review.reviewedAt);
  return (
    <aside
      className="shop-review-notice space-y-1 rounded-lg border border-border bg-secondary/40 p-3 text-sm"
      aria-label="Latest shop review"
      data-review-status={shop.review.status}
    >
      <p className="font-medium">
        {shop.status === "pending" && shop.review.status !== "pending"
          ? "Previous admin review"
          : "Latest admin review"}
        : {shop.review.status}
      </p>
      {shop.review.reason && (
        <p className="whitespace-pre-wrap break-words">{shop.review.reason}</p>
      )}
      {Number.isFinite(date.getTime()) && (
        <p className="text-xs text-muted-foreground">
          <time dateTime={shop.review.reviewedAt}>
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(date)}
          </time>{" "}
          · India time
        </p>
      )}
    </aside>
  );
}
