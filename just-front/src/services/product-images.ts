import { api } from "@/lib/api/client";
import type { ManagedProduct } from "@/domain/management";
export interface ImageUploadCapability {
  enabled: boolean;
  maxBytes: number;
  types: string[];
}
export const productImages = {
  capability: () => api<ImageUploadCapability>("/seller/image-upload"),
  upload: (product: ManagedProduct, file: File) =>
    api<ManagedProduct>(`/seller/products/${encodeURIComponent(product.id)}/image`, {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type, "X-Product-Version": String(product.version) },
    }),
};
