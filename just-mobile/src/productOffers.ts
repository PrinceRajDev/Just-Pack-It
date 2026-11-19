import type { Product } from "./api";
export type DetailProduct = Product & {
  mrp?: number;
  images?: string[];
  taxInclusive?: boolean;
  brand?: string;
  attributes?: { label: string; value: string }[];
};
const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/g, " ");
export function packKey(label: string): string {
  const text = normalize(label);
  const measure = text.match(
    /^(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|gm|grams?|ml|l|litres?|liters?)$/,
  );
  if (measure) {
    const amount = Number(measure[1]);
    const unit = measure[2];
    return /^(kg|kilogram)/.test(unit)
      ? `${amount * 1000}:g`
      : /^(g|gm|gram)/.test(unit)
        ? `${amount}:g`
        : /^(l|litre|liter)/.test(unit)
          ? `${amount * 1000}:ml`
          : `${amount}:ml`;
  }
  const pieces = text.match(/^(\d+)\s*(pc|pcs|pec|piece|pieces)$/);
  return pieces ? `${Number(pieces[1])}:pieces` : text;
}
function attribute(item: DetailProduct, names: string[]): string | undefined {
  const value = item.attributes?.find((row) =>
    names.includes(normalize(row.label)),
  )?.value;
  return value?.trim() ? normalize(value) : undefined;
}
export function equivalentProduct(
  base: DetailProduct,
  item: DetailProduct,
): boolean {
  if (base.id === item.id) return true;
  const code = attribute(base, ["gtin", "barcode", "ean", "upc"]);
  const otherCode = attribute(item, ["gtin", "barcode", "ean", "upc"]);
  if (code && otherCode) return code === otherCode;
  // A conflicting barcode is never overridden by a similar name. Without a
  // global code, require an explicit identical brand, name and category.
  const brand = base.brand
    ? normalize(base.brand)
    : attribute(base, ["brand", "brand name", "ब्रांड"]);
  const otherBrand = item.brand
    ? normalize(item.brand)
    : attribute(item, ["brand", "brand name", "ब्रांड"]);
  return (
    !!brand &&
    brand === otherBrand &&
    !!base.categorySlug &&
    base.categorySlug === item.categorySlug &&
    normalize(base.name) === normalize(item.name)
  );
}
export function offerForPack(product: DetailProduct, key: string) {
  if (product.variants?.length) {
    const variant =
      product.variants.find((item) => item.id === key) ??
      product.variants.find((item) => packKey(item.label) === key);
    if (!variant) return null;
    return {
      product,
      variant,
      label: variant.label,
      price: variant.price,
      stock: variant.stock,
      mrp:
        packKey(product.unit) === key && variant.price === product.price
          ? product.mrp
          : undefined,
      line: {
        ...product,
        id: `${product.id}:${variant.id}`,
        productId: product.id,
        variantId: variant.id,
        unit: variant.label,
        price: variant.price,
        stock: variant.stock,
        variants: undefined,
      } as Product,
    };
  }
  return packKey(product.unit) === key
    ? {
        product,
        variant: undefined,
        label: product.unit,
        price: product.price,
        stock: product.stock,
        mrp: product.mrp,
        line: product as Product,
      }
    : null;
}
