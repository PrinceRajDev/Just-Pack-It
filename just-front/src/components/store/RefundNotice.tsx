import type { RefundSummary } from "@/domain/refunds";
import { inr } from "@/lib/image";
const refundLabel = {
  requested: "Refund requested: not yet issued",
  submitting: "Refund submission in progress",
  uncertain: "Refund submission uncertain: operator check needed",
  pending: "Refund pending with provider",
  processed: "Refund processed by provider",
  failed: "Refund failed: operator review needed",
};
export function RefundNotice({ refund }: { refund: RefundSummary }) {
  return (
    <p role="status" className="rounded border border-primary/20 bg-secondary/30 p-3 text-sm">
      {refundLabel[refund.state]} · {inr(refund.amount)}.{" "}
      {refund.state === "processed"
        ? "Bank credit timing depends on the original payment method; this is not a seller settlement."
        : "Cancellation does not mean money has been returned. Do not pay this amount again."}
    </p>
  );
}
