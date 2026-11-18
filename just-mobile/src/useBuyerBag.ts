import { useEffect, useState, type SetStateAction } from "react";
import * as SecureStore from "./deviceStorage";
import type { Product } from "./api";

type Line = Product & { quantity: number };
let writes: Promise<unknown> = Promise.resolve();
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
        const parsed: unknown = value ? JSON.parse(value) : [];
        if (
          !Array.isArray(parsed) ||
          !parsed.every(
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
        if (active) {
          setSaved({ key, lines: parsed as Line[] });
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
