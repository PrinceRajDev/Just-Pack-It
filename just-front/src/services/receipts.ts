import { z } from "zod";
import { api } from "@/lib/api/client";
import type { SellerSuborder } from "@/domain/seller-orders";
const codeResponse = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
  expiresAt: z.string().datetime(),
  issuedAt: z.string().datetime(),
  amount: z.number().finite().nonnegative(),
});
export const receipts = {
  async issue(orderId: string, subId: string, version: number, prepaid = false) {
    return codeResponse.parse(
      await api<unknown>(
        `/orders/${encodeURIComponent(orderId)}/suborders/${encodeURIComponent(subId)}/receipt-code`,
        {
          method: "POST",
          body: JSON.stringify({
            version,
            confirmReceived: true,
            ...(!prepaid ? { confirmCashPaid: true } : {}),
          }),
          signal: AbortSignal.timeout(30_000),
        },
      ),
    );
  },
  complete(sub: SellerSuborder, code: string) {
    return api<SellerSuborder>(
      `/seller/orders/${encodeURIComponent(sub.orderId)}/suborders/${encodeURIComponent(sub.id)}/${sub.paymentMethod === "razorpay" ? "complete-handoff" : "complete-cash"}`,
      {
        method: "POST",
        body: JSON.stringify({
          version: sub.version,
          code,
          ...(sub.paymentMethod === "razorpay"
            ? { confirmHandoff: true }
            : { confirmCashReceived: true, amountReceived: sub.amountDue }),
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  },
};
