import { api } from "@/lib/api/client";
import type { ManagedShop } from "@/domain/management";
export const shopImages = {
  upload: (shop: ManagedShop, file: File) =>
    api<ManagedShop>("/seller/shop/image", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type, "X-Shop-Version": String(shop.version) },
    }),
};
