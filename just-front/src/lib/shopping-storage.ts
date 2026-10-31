import type { CartLine } from "@/domain/types";
export function parseLines(raw: string | null): Record<string, CartLine> {
  try {
    const data = JSON.parse(raw ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.values(data)
        .slice(0, 100)
        .flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const line = value as CartLine;
          if (
            typeof line.productId !== "string" ||
            !line.productId ||
            line.productId.length > 100 ||
            !Number.isInteger(line.qty) ||
            line.qty < 1 ||
            line.qty > 999 ||
            (line.variantId !== undefined &&
              (typeof line.variantId !== "string" ||
                !line.variantId ||
                line.variantId.length > 100))
          )
            return [];
          const key = line.variantId ? `${line.productId}::${line.variantId}` : line.productId;
          return [
            [
              key,
              {
                productId: line.productId,
                variantId: line.variantId,
                qty: line.qty,
                ...(typeof line.acceptedPrice === "number" &&
                Number.isFinite(line.acceptedPrice) &&
                line.acceptedPrice >= 0
                  ? { acceptedPrice: line.acceptedPrice }
                  : {}),
              },
            ],
          ];
        }),
    );
  } catch {
    return {};
  }
}
export function parseWishes(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100,
            ),
          ),
        ].slice(0, 1000)
      : [];
  } catch {
    return [];
  }
}
export function mergeShopping(
  current: Record<string, CartLine>,
  incoming: Record<string, CartLine>,
) {
  const result = { ...current };
  for (const [key, line] of Object.entries(incoming)) {
    if (!result[key] && Object.keys(result).length < 100) {
      const { acceptedPrice: _price, ...rest } = line;
      result[key] = rest;
    }
  }
  return result;
}
export function shoppingKeys(apiUrl: string, owner: string) {
  const base = `jpi.shopping:${encodeURIComponent(apiUrl)}:${owner}`;
  return { cart: `${base}:cart`, wish: `${base}:wish` };
}
