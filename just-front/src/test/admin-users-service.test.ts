import { it, expect, vi } from "vitest";
import { adminUsers } from "@/services/admin-users";
import { api } from "@/lib/api/client";
vi.mock("@/lib/api/client", () => ({ api: vi.fn().mockResolvedValue({ items: [], total: 0 }) }));
it("omits an empty optional search instead of sending the literal undefined", async () => {
  await adminUsers.list({ role: "all", state: "all", q: undefined });
  expect(api).toHaveBeenCalledWith("/admin/users?role=all&state=all");
});
