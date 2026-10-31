import { api } from "@/lib/api/client";
import type { PlatformSettings, PublicPlatformSettings } from "@/domain/platform-settings";
export const platformSettings = {
  public: () => api<PublicPlatformSettings>("/platform-settings"),
  get: () => api<PlatformSettings>("/admin/platform-settings"),
  save: (draft: PublicPlatformSettings, version: number, reason: string) =>
    api<PlatformSettings>("/admin/platform-settings", {
      method: "PATCH",
      body: JSON.stringify({ ...draft, version, reason }),
    }),
};
