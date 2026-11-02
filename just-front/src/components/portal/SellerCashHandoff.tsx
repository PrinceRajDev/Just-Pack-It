import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { receipts } from "@/services/receipts";
import { ApiError } from "@/lib/api/client";
import type { SellerSuborder } from "@/domain/seller-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/image";
export function SellerCashHandoff({ sub, onSaved }: { sub: SellerSuborder; onSaved: () => void }) {
  const [code, setCode] = useState(""),
    [cash, setCash] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [locked, setLocked] = useState(false);
  const client = useQueryClient();
  async function complete() {
    if (busy || locked || !cash || !/^[0-9]{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      await receipts.complete(sub, code);
      setCode("");
      onSaved();
      await client.invalidateQueries({ queryKey: ["seller-orders"] });
      void client.invalidateQueries({ queryKey: ["order"] });
      void client.invalidateQueries({ queryKey: ["orders"] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Confirmation is uncertain; refresh this suborder before retrying.",
      );
      setLocked(!(cause instanceof ApiError && cause.code === "INVALID_RECEIPT_CODE"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <UiAttributes>
      <div className="space-y-3 border-t border-border pt-4" aria-label="Verify handoff and cash">
        <h3 className="font-semibold">
          <UiText>
            {sub.paymentMethod === "razorpay"
              ? "Verify prepaid handoff"
              : "Verify buyer receipt and cash"}
          </UiText>
        </h3>
        <p className="text-sm">
          <UiText>
            {sub.paymentMethod === "razorpay"
              ? "Payment is captured online. Verify the buyer's code after goods handover. Do not collect cash."
              : "Ask the buyer to generate a code in their account after goods and cash handover. This records cash; it does not verify a bank transfer or settlement."}
          </UiText>
        </p>
        <Label htmlFor={`receipt-${sub.id}`}>Buyer's six-digit receipt code</Label>
        <Input
          id={`receipt-${sub.id}`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={busy || locked}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-primary"
            checked={cash}
            onChange={(event) => setCash(event.target.checked)}
            disabled={busy || locked}
          />
          <UiText>
            {sub.paymentMethod === "razorpay"
              ? "I handed over all items to the correct buyer. No cash was collected."
              : `I actually received ${inr(sub.amountDue)} in cash for this suborder.`}
          </UiText>
        </label>
        <Button
          disabled={busy || locked || !cash || !/^[0-9]{6}$/.test(code)}
          onClick={() => void complete()}
        >
          <UiText>
            {busy
              ? "Verifying…"
              : sub.paymentMethod === "razorpay"
                ? "Confirm prepaid handoff"
                : "Confirm handoff & record cash"}
          </UiText>
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
            <UiText>
              {locked
                ? " Refresh orders before another action."
                : " Ask the buyer to check the code; wrong attempts are limited."}
            </UiText>
          </p>
        )}
      </div>
    </UiAttributes>
  );
}
