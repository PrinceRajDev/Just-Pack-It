import { parseLines, parseWishes, mergeShopping } from "@/lib/shopping-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { productById } from "@/services/catalog";
import type { CartLine } from "@/domain/types";
import { isDemoMode } from "@/lib/config";

type Lines = Record<string, CartLine>;
export const cartLineKey = (productId: string, variantId?: string) =>
  variantId ? `${productId}::${variantId}` : productId;
interface CartCtx {
  addReviewed: (items: CartLine[]) => void;
  ready: boolean;
  lines: Lines;
  count: number;
  quantity: (productId: string, variantId?: string) => number;
  setQty: (productId: string, qty: number, variantId?: string) => void;
  add: (productId: string, variantId?: string) => void;
  remove: (productId: string, variantId?: string) => void;
  clear: () => void;
  removePurchased: (items: CartLine[]) => void;
  acceptPrice: (productId: string, variantId?: string) => void;
  wishlist: string[];
  toggleWish: (id: string) => void;
  importStored: (cartKey: string, wishKey: string) => boolean;
}
const Ctx = createContext<CartCtx | null>(null);
const KEY = isDemoMode ? "jpi.cart" : "jpi.api.cart";
const WKEY = isDemoMode ? "jpi.wish" : "jpi.api.wish";

export function CartProvider({
  children,
  storageKeys,
  persist = true,
}: {
  children: ReactNode;
  storageKeys?: { cart: string; wish: string };
  persist?: boolean;
}) {
  const cartKey = storageKeys?.cart ?? KEY,
    wishKey = storageKeys?.wish ?? WKEY;
  const [lines, setLines] = useState<Lines>({});
  const [wishlist, setWish] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (storageKeys) {
      try {
        setLines(parseLines(localStorage.getItem(cartKey)));
        setWish(parseWishes(localStorage.getItem(wishKey)));
      } catch {
        /* storage unavailable: retain an empty account-local bag */
      }
      setReady(true);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(cartKey) ?? "{}") as Record<
        string,
        CartLine | number
      >;
      // Migrate the previous productId -> quantity demo cart shape without losing a bag.
      setLines(
        storageKeys
          ? parseLines(localStorage.getItem(cartKey))
          : Object.fromEntries(
              Object.entries(saved).flatMap(([key, value]) => {
                const item: CartLine | undefined =
                  typeof value === "number" ? { productId: key, qty: value } : value;
                if (
                  !item ||
                  typeof item.productId !== "string" ||
                  !item.productId ||
                  item.productId.length > 100 ||
                  !Number.isInteger(item.qty) ||
                  item.qty <= 0 ||
                  item.qty > 999
                )
                  return [];
                if (
                  item.variantId !== undefined &&
                  (typeof item.variantId !== "string" ||
                    !item.variantId ||
                    item.variantId.length > 100)
                )
                  return [];
                return [
                  [
                    cartLineKey(item.productId, item.variantId),
                    {
                      productId: item.productId,
                      variantId: item.variantId,
                      qty: item.qty,
                      ...(typeof item.acceptedPrice === "number" &&
                      Number.isFinite(item.acceptedPrice) &&
                      item.acceptedPrice >= 0
                        ? { acceptedPrice: item.acceptedPrice }
                        : {}),
                    },
                  ],
                ];
              }),
            ),
      );
      setWish(parseWishes(localStorage.getItem(wishKey)));
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    try {
      if (ready && persist) localStorage.setItem(cartKey, JSON.stringify(lines));
    } catch {
      /* Keep the bag in memory when storage is blocked. */
    }
  }, [lines, ready, cartKey, persist]);
  useEffect(() => {
    try {
      if (ready && persist) localStorage.setItem(wishKey, JSON.stringify(wishlist));
    } catch {
      /* Optional browser storage. */
    }
  }, [wishlist, ready, wishKey, persist]);

  useEffect(() => {
    if (!persist) return;
    const sync = (event: StorageEvent) => {
      try {
        if (event.key === cartKey) setLines(parseLines(localStorage.getItem(cartKey)));
        if (event.key === wishKey) setWish(parseWishes(localStorage.getItem(wishKey)));
      } catch {
        /* keep current state if storage becomes unavailable */
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [cartKey, wishKey, persist]);
  const value = useMemo<CartCtx>(() => {
    const quantity = (productId: string, variantId?: string) =>
      lines[cartLineKey(productId, variantId)]?.qty ?? 0;
    const setQty = (productId: string, qty: number, variantId?: string) => {
      if (!Number.isInteger(qty) || qty > 999) {
        toast.warning("Choose a whole quantity up to 999");
        return;
      }
      const p = productById(productId);
      const variant = variantId ? p?.variants?.find((item) => item.id === variantId) : undefined;
      const max = variant ? variant.stock : (p?.stock ?? 0);
      const key = cartLineKey(productId, variantId);
      if (qty > 0 && !lines[key] && Object.keys(lines).length >= 100) {
        toast.warning("Your bag can contain up to 100 different items");
        return;
      }
      if (qty > 0 && (!p || (!!p.variants?.length && !variant) || (!!variantId && !variant))) {
        toast.warning("Choose a valid product option first");
        return;
      }
      if (qty > max) {
        toast.warning(`Only ${max} available from this shop`);
        qty = max;
      }
      setLines((l) => {
        const n = { ...l };
        if (qty <= 0) delete n[key];
        else
          n[key] = {
            productId,
            variantId,
            qty,
            acceptedPrice: l[key]?.acceptedPrice ?? variant?.price ?? p?.price,
          };
        return n;
      });
    };
    return {
      addReviewed: (items) =>
        setLines((current) => {
          const next = { ...current };
          for (const item of items) {
            const product = productById(item.productId);
            const variant = product?.variants?.find((variant) => variant.id === item.variantId);
            if (!product || (product.variants?.length && !variant) || (item.variantId && !variant))
              continue;
            const key = cartLineKey(item.productId, item.variantId);
            if (!next[key] && Object.keys(next).length >= 100) continue;
            const qty = Math.min(
              999,
              variant?.stock ?? product.stock,
              (next[key]?.qty ?? 0) + item.qty,
            );
            if (qty <= 0 || !Number.isInteger(qty)) continue;
            next[key] = {
              productId: item.productId,
              variantId: item.variantId,
              qty,
              acceptedPrice: next[key]?.acceptedPrice ?? variant?.price ?? product.price,
            };
          }
          return next;
        }),
      ready,
      lines,
      count: Object.values(lines).reduce((total, line) => total + line.qty, 0),
      quantity,
      setQty,
      add: (productId, variantId) => {
        const key = cartLineKey(productId, variantId);
        setQty(productId, (lines[key]?.qty ?? 0) + 1, variantId);
        if (!lines[key]) toast.success(`${productById(productId)?.name ?? "Item"} added to bag`);
      },
      remove: (productId, variantId) => setQty(productId, 0, variantId),
      clear: () => setLines({}),
      removePurchased: (items) =>
        setLines((current) => {
          const next = { ...current };
          for (const item of items) {
            const key = cartLineKey(item.productId, item.variantId);
            if (next[key]?.qty === item.qty) delete next[key];
          }
          return next;
        }),
      acceptPrice: (productId, variantId) => {
        const p = productById(productId);
        const variant = p?.variants?.find((v) => v.id === variantId);
        const price = variant?.price ?? p?.price;
        if (price === undefined || (variantId && !variant)) return;
        setLines((current) => {
          const key = cartLineKey(productId, variantId);
          return current[key]
            ? { ...current, [key]: { ...current[key], acceptedPrice: price } }
            : current;
        });
      },
      wishlist,
      importStored: (sourceCart, sourceWish) => {
        try {
          const merged = mergeShopping(lines, parseLines(localStorage.getItem(sourceCart))),
            wishes = [
              ...new Set([...wishlist, ...parseWishes(localStorage.getItem(sourceWish))]),
            ].slice(0, 1000);
          localStorage.setItem(cartKey, JSON.stringify(merged));
          localStorage.setItem(wishKey, JSON.stringify(wishes));
          if (
            localStorage.getItem(cartKey) !== JSON.stringify(merged) ||
            localStorage.getItem(wishKey) !== JSON.stringify(wishes)
          )
            throw new Error();
          setLines(merged);
          setWish(wishes);
          const remaining = Object.fromEntries(
            Object.entries(parseLines(localStorage.getItem(sourceCart))).filter(
              ([key]) => !merged[key],
            ),
          );
          const remainingWishes = parseWishes(localStorage.getItem(sourceWish)).filter(
            (id) => !wishes.includes(id),
          );
          if (Object.keys(remaining).length)
            localStorage.setItem(sourceCart, JSON.stringify(remaining));
          else localStorage.removeItem(sourceCart);
          if (remainingWishes.length)
            localStorage.setItem(sourceWish, JSON.stringify(remainingWishes));
          else localStorage.removeItem(sourceWish);
          toast.success("Saved items imported. Review stock and current prices before checkout.");
          return true;
        } catch {
          toast.error(
            "Could not confirm import. Source data was kept where possible; check this bag before retrying.",
          );
          return false;
        }
      },
      toggleWish: (id) =>
        setWish((w) => {
          const has = w.includes(id);
          if (!has && w.length >= 1000) {
            toast.warning("Your wishlist can contain up to 1000 saved products");
            return w;
          }
          toast(has ? "Removed from wishlist" : "Saved to wishlist");
          return has ? w.filter((x) => x !== id) : [...w, id];
        }),
    };
  }, [lines, wishlist, cartKey, wishKey, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
