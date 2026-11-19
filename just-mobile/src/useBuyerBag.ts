import { useEffect, useState, type SetStateAction } from "react";
import * as SecureStore from "./deviceStorage";
import type { Product } from "./api";

type Line = Product & { quantity: number };
const guestKey = "jpi.bag.guest";
let writes: Promise<unknown> = Promise.resolve();

function readBag(value: string | null): {
  lines: Line[];
  mergedGuest?: string;
} {
  const parsed = value ? JSON.parse(value) : [];
  const lines: unknown = Array.isArray(parsed) ? parsed : parsed?.lines;
  if (
    !Array.isArray(lines) ||
    !lines.every(
      (line) =>
        line &&
        typeof line.id === "string" &&
        typeof line.name === "string" &&
        typeof line.shopId === "string" &&
        Number.isFinite(line.price) &&
        line.price > 0 &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        Number.isInteger(line.stock) &&
        line.stock >= 0,
    )
  )
    throw new Error("Invalid saved bag");
  return {
    lines,
    mergedGuest:
      typeof parsed.mergedGuest === "string" ? parsed.mergedGuest : undefined,
  };
}

export async function mergeGuestBag(userId: string) {
  const key = `jpi.bag.${userId}`;
  const transfer = writes
    .catch(() => undefined)
    .then(async () => {
      const guest = await SecureStore.getItemAsync(guestKey);
      const incoming = readBag(guest).lines;
      if (!guest || !incoming.length) return;
      const account = readBag(await SecureStore.getItemAsync(key));
      if (account.mergedGuest !== guest) {
        const lineKey = (line: Line) =>
          JSON.stringify([
            line.shopId,
            line.productId ?? line.id,
            line.variantId,
          ]);
        const merged = new Map(
          account.lines.map((line) => [lineKey(line), line]),
        );
        for (const line of incoming) {
          const id = lineKey(line);
          const existing = merged.get(id);
          const quantity = existing
            ? Math.max(
                existing.quantity,
                Math.min(line.stock, existing.quantity + line.quantity),
              )
            : line.quantity;
          merged.set(id, { ...line, id: existing?.id ?? line.id, quantity });
        }
        // Keep the transfer marker until the source has been consumed so a retry
        // after a storage failure cannot add the same guest items twice.
        await SecureStore.setItemAsync(
          key,
          JSON.stringify({
            lines: [...merged.values()],
            mergedGuest: guest,
          }),
        );
      }
      await SecureStore.deleteItemAsync(guestKey);
    });
  writes = transfer;
  await transfer;
}

export function useBuyerBag(userId?: string) {
  const key = `jpi.bag.${userId ?? "guest"}`;
  const [saved, setSaved] = useState<{ key: string; lines: Line[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void writes
      .catch(() => undefined)
      .then(() => SecureStore.getItemAsync(key))
      .then((value) => {
        const { lines } = readBag(value);
        if (active) {
          setSaved({ key, lines });
          setError(null);
        }
      })
      .catch(() => {
        if (active)
          setError("Your saved bag could not load. Restart the app to retry.");
      });
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (!saved || saved.key !== key) return;
    let active = true;
    writes = writes
      .catch(() => undefined)
      .then(() => SecureStore.setItemAsync(key, JSON.stringify(saved.lines)));
    void writes.catch(() => {
      if (active) setError("Your bag could not be saved on this device.");
    });
    return () => {
      active = false;
    };
  }, [saved, key]);
  const ready = saved?.key === key;
  const setBag = (update: SetStateAction<Line[]>) =>
    setSaved((current) => {
      if (!current || current.key !== key) return current;
      return {
        key,
        lines: typeof update === "function" ? update(current.lines) : update,
      };
    });
  return { bag: ready ? saved.lines : [], setBag, ready, error };
}
