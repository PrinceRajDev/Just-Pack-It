import { UiText, UiAttributes } from "@/lib/i18n/Language";
import type { Order } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
import { fulfilmentLabel } from "./ShopMark";
import { cashLabel } from "@/lib/cash-label";
import { isDemoMode } from "@/lib/config";
import { shopById } from "@/services/catalog";
export function OrderReceipt({ order }: { order: Order }) {
  return (
    <>
      <Button variant="outline" onClick={() => window.print()}>
        Print order receipt
      </Button>
      <UiAttributes>
        <section className="order-receipt" aria-label="Printable order receipt">
          <h1>Just Pack It: Order receipt</h1>
          {(order.isDemo || isDemoMode || order.testMode) && (
            <p>
              <strong>
                <UiText>
                  {order.testMode
                    ? "TEST ORDER: no real payment. Do not fulfil."
                    : "DEMO: sample order, not a real purchase."}
                </UiText>
              </strong>
            </p>
          )}
          <p>
            <UiText>{"Order "}</UiText>
            {order.id}
          </p>
          <p>
            {new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            <UiText>{"· India time"}</UiText>
          </p>
          <p>
            Payment method: {order.paymentMethod.toUpperCase()} · {cashLabel(order.paymentStatus)}
          </p>
          {order.address && (
            <p>
              Order address: {order.address.line1}, {order.address.locality}, {order.address.city}{" "}
              {order.address.pincode}
            </p>
          )}
          {order.subOrders.map((sub) => (
            <section key={sub.id}>
              <h2>
                {sub.shopName ??
                  (isDemoMode ? shopById(sub.shopId)?.name : undefined) ??
                  "Seller name not recorded"}
              </h2>
              <p>{sub.shopAddress ?? "Seller address not recorded"}</p>
              <p>
                Shop ID: {sub.shopId} · Part: {sub.id}
              </p>
              <p>
                {fulfilmentLabel[sub.fulfilment]} · Status: {sub.status.replaceAll("_", " ")}
              </p>
              <table>
                <caption>Items ordered from this seller</caption>
                <thead>
                  <tr>
                    <th scope="col">Item / option</th>
                    <th scope="col">
                      <UiText>{"Quantity"}</UiText>
                    </th>
                    <th scope="col">Unit price</th>
                    <th scope="col">
                      <UiText>{"Amount"}</UiText>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sub.lines.map((line, index) => (
                    <tr key={index}>
                      <td>
                        {line.name}
                        <UiText>{line.variantLabel ? ` · ${line.variantLabel}` : ""}</UiText> ·{" "}
                        {line.unit}
                      </td>
                      <td>{line.qty}</td>
                      <td>{inr(line.price)}</td>
                      <td>{inr(line.qty * line.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>Delivery charge: {inr(sub.deliveryFee)}</p>
              <p>
                Original shop total:{" "}
                {inr(
                  sub.lines.reduce((sum, line) => sum + line.price * line.qty, 0) + sub.deliveryFee,
                )}
              </p>
              {sub.cancelReason && <p>Cancellation: {sub.cancelReason}</p>}
              {sub.refund && (
                <p>
                  Refund: {inr(sub.refund.amount)} · {sub.refund.state}
                </p>
              )}
              {sub.cashCollection && (
                <p>
                  <UiText>{"Cash recorded: "}</UiText>
                  {inr(sub.cashCollection.amount)} on{" "}
                  {new Date(sub.cashCollection.recordedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              )}
            </section>
          ))}
          <p>
            <strong>Original order total: {inr(order.total)}</strong>
          </p>
          {order.cancelledAmount !== undefined && (
            <p>Cancelled portion: {inr(order.cancelledAmount)}</p>
          )}
          {order.amountDue !== undefined && (
            <p>Current order amount after cancellations: {inr(order.amountDue)}</p>
          )}
          {order.onlinePaidAmount !== undefined && (
            <p>Online payment recorded: {inr(order.onlinePaidAmount)}</p>
          )}
          {order.cashRecordedAmount !== undefined && (
            <p>
              <UiText>{"Cash recorded: "}</UiText>
              {inr(order.cashRecordedAmount)}
            </p>
          )}
          <p>
            This is an order summary, not a tax invoice or proof that an unpaid order was paid.
            Seller tax invoice details are not supplied. Payment and refund status may change after
            printing.
          </p>
        </section>
      </UiAttributes>
    </>
  );
}
