import { api, apiAll, ApiError } from "@/lib/api/client";
import type { ProductVariant } from "@/domain/types";
import type {
  ManagedCategory,
  ManagedArea,
  ManagedShop,
  ManagedProduct,
  ShopInput,
  ProductInput,
  VariantInput,
  ShopStatus,
  SellerAccount,
} from "@/domain/management";
const write = <T>(path: string, method: string, body: unknown) =>
  api<T>(path, { method, body: JSON.stringify(body) });
const id = encodeURIComponent;
export const management = {
  availability: (
    shop: ManagedShop,
    input: Pick<
      ShopInput,
      "temporarilyClosed" | "openingHours" | "timezone" | "fulfilment" | "pickupNote"
    > & { deliveryFee?: number; minimumOrderAmount?: number },
  ) =>
    write<ManagedShop>("/seller/shop/availability", "PATCH", { ...input, version: shop.version }),
  sellers: () => apiAll<SellerAccount>("/admin/sellers"),
  createSeller: (input: { name: string; phone: string; password: string }) =>
    write<SellerAccount>("/admin/sellers", "POST", input),
  categories: () => api<ManagedCategory[]>("/categories"),
  areas: () => api<ManagedArea[]>("/areas"),
  async shop(): Promise<ManagedShop | null> {
    try {
      return await api<ManagedShop>("/seller/shop");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === "SHOP_NOT_FOUND")
        return null;
      throw error;
    }
  },
  saveShop: (input: ShopInput, version?: number) =>
    write<ManagedShop>(
      "/seller/shop",
      version === undefined ? "POST" : "PATCH",
      version === undefined ? input : { ...input, version },
    ),
  products: () => apiAll<ManagedProduct>("/seller/products"),
  product: (productId: string) => api<ManagedProduct>(`/seller/products/${id(productId)}`),
  saveProduct: (input: ProductInput, product?: ManagedProduct) =>
    write<ManagedProduct>(
      `/seller/products${product ? `/${id(product.id)}` : ""}`,
      product ? "PATCH" : "POST",
      product ? { ...input, version: product.version } : input,
    ),
  variant: (product: ManagedProduct, input: VariantInput, variantId?: string) =>
    write<ProductVariant & { version: number }>(
      `/seller/products/${id(product.id)}/variants${variantId ? `/${id(variantId)}` : ""}`,
      variantId ? "PATCH" : "POST",
      { ...input, version: product.version },
    ),
  removeVariant: (product: ManagedProduct, variantId: string) =>
    write<void>(`/seller/products/${id(product.id)}/variants/${id(variantId)}`, "DELETE", {
      version: product.version,
    }),
  shops: () => apiAll<ManagedShop>("/admin/shops"),
  approve: (shop: ManagedShop, status: ShopStatus, reason?: string) =>
    write<ManagedShop>(`/admin/shops/${id(shop.id)}/approval`, "PATCH", {
      version: shop.version,
      status,
      ...(reason ? { reason } : {}),
    }),
  adminCategories: () => api<ManagedCategory[]>("/admin/categories"),
  category: (input: { name: string; slug?: string; blurb?: string }, category?: ManagedCategory) =>
    write<ManagedCategory>(
      `/admin/categories${category ? `/${id(category.id)}` : ""}`,
      category ? "PATCH" : "POST",
      category ? { ...input, version: category.version } : input,
    ),
  removeCategory: (category: ManagedCategory) =>
    write<void>(`/admin/categories/${id(category.id)}`, "DELETE", { version: category.version }),
  subcategory: (
    category: ManagedCategory,
    input: { name: string; slug?: string },
    subId?: string,
  ) =>
    write<ManagedCategory>(
      `/admin/categories/${id(category.id)}/subcategories${subId ? `/${id(subId)}` : ""}`,
      subId ? "PATCH" : "POST",
      { ...input, version: category.version },
    ),
  removeSubcategory: (category: ManagedCategory, subId: string) =>
    write<void>(`/admin/categories/${id(category.id)}/subcategories/${id(subId)}`, "DELETE", {
      version: category.version,
    }),
  adminAreas: () => api<ManagedArea[]>("/admin/areas"),
  area: (
    input: { name: string; city: string; pincodes: string[]; active?: boolean },
    area?: ManagedArea,
  ) =>
    write<ManagedArea>(
      `/admin/areas${area ? `/${id(area.id)}` : ""}`,
      area ? "PATCH" : "POST",
      area ? { ...input, version: area.version } : input,
    ),
};
