import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  codAttemptEvent,
  readCodAttempt,
  resetCodAttempt,
  submitCodAttempt,
} from "@/services/cod-orders";
import type { CodOrderInput, CodAttempt } from "@/domain/cod";
import { useCart } from "@/stores/cart";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
export function CodOrderAction({
  userId,
  input = null,
  onReset,
}: {
  userId: string;
  input?: CodOrderInput | null;
  onReset?: () => void;
}) {
  const [attempt, setAttempt] = useState<CodAttempt | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState("");
  const cart = useCart(),
    client = useQueryClient(),
    navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const load = () => {
      try {
        setAttempt(readCodAttempt(userId));
        setStorageError("");
      } catch {
        setStorageError(
          "Order recovery storage is unavailable or invalid. Check order history before trying again.",
        );
      }
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener(codAttemptEvent, load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener(codAttemptEvent, load);
    };
  }, [userId]);
  async function place(recover: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitCodAttempt(userId, recover ? null : input);
      if (!mounted.current) return;
      cart.removePurchased(result.input.items);
      void client.invalidateQueries({ queryKey: ["orders", userId] });
      void navigate({
        to: "/orders/$id",
        params: { id: result.order.id },
        search: { placed: true },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't confirm the order. Recover the same attempt before ordering again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    setError("");
    try {
      await resetCodAttempt(userId);
      onReset?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't reset order recovery.");
    } finally {
      setBusy(false);
    }
  }
  if (!input && !attempt && !storageError) return null;
  return (
    <div
      className="space-y-3 rounded-lg border border-border p-4"
      aria-label="COD confirmation and recovery"
    >
      {storageError && (
        <p role="alert" className="text-sm text-destructive">
          {storageError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {attempt?.state === "confirmed" ? (
        <>
          <p className="text-sm">
            The previous attempt was confirmed. View its order before starting another purchase.
          </p>
          <Button asChild variant="outline">
            <Link to="/orders/$id" params={{ id: attempt.orderId! }}>
              View confirmed order
            </Link>
          </Button>
          <Button variant="outline" disabled={busy || !!storageError} onClick={() => void reset()}>
            Start a separate new order
          </Button>
        </>
      ) : attempt?.state === "rejected" ? (
        <>
          <p className="text-sm">
            The server rejected the previous attempt ({attempt.errorCode}). Refresh your bag review
            before trying again.
          </p>
          <Button disabled={busy || !!storageError} variant="outline" onClick={() => void reset()}>
            Return to a fresh review
          </Button>
        </>
      ) : attempt?.state === "pending" ? (
        <>
          <p className="text-sm">
            An order attempt for {inr(attempt.input.expectedTotal)} is unresolved. Recovery reuses
            its original items, address and request key. If the server never received it, this
            action may place that previously confirmed COD order.
          </p>
          <Button disabled={busy || !!storageError} onClick={() => void place(true)}>
            {busy ? "Recovering…" : "Recover previous order attempt"}
          </Button>
        </>
      ) : (
        input && (
          <>
            <p className="text-sm">Pay {inr(input.expectedTotal)} when you receive your order.</p>
            <Button disabled={busy || !!storageError} onClick={() => void place(false)}>
              {busy ? "Confirming order…" : `Place COD order · ${inr(input.expectedTotal)}`}
            </Button>
          </>
        )
      )}
      {busy && (
        <p role="status" className="text-sm">
          Wait for confirmation. Retrying with a new request key can duplicate an order.
        </p>
      )}
    </div>
  );
}
