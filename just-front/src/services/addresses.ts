import { api } from "@/lib/api/client";
import type { Address } from "@/domain/types";
export interface SavedAddress extends Address {
  version: number;
}
export type AddressInput = Omit<Address, "id">;
export const savedAddresses = {
  list: (signal?: AbortSignal) => api<SavedAddress[]>("/addresses", { signal }),
  create: (input: AddressInput) =>
    api<SavedAddress>("/addresses", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, version: number, input: AddressInput) =>
    api<SavedAddress>(`/addresses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...input, version }),
    }),
  remove: (id: string, version: number) =>
    api<void>(`/addresses/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({ version }),
    }),
};
