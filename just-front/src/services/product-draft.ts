import { api } from "@/lib/api/client";
export interface ProductDraft {
  name: string;
  description: string;
  unit: string;
  categoryId: string;
}
export const productDraft = {
  capability: () => api<{ enabled: boolean }>("/seller/product-draft"),
  generate: (file: File, signal: AbortSignal) =>
    api<ProductDraft>("/seller/product-draft", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type },
      signal,
    }),
};
