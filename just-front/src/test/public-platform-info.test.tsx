import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PublicPlatformInfo } from "@/components/store/PublicPlatformInfo";
import { platformSettings } from "@/services/platform-settings";
vi.mock("@/lib/config", () => ({ isDemoMode: false }));
vi.mock("@/services/platform-settings", () => ({ platformSettings: { public: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PublicPlatformInfo />
    </QueryClientProvider>,
  );
  return client;
};

it("renders announcement as text and only configured support links", async () => {
  vi.mocked(platformSettings.public).mockResolvedValue({
    supportEmail: "help@qa.invalid",
    supportPhone: "+919000000001",
    supportHours: "QA hours",
    noticeEnabled: true,
    noticeText: "<img src=x onerror=alert(1)>",
  });
  mount();
  await screen.findByText("<img src=x onerror=alert(1)>");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByRole("link", { name: "help@qa.invalid" })).toHaveAttribute(
    "href",
    "mailto:help@qa.invalid",
  );
});
it("does not display an unpublished notice or fabricated contacts", async () => {
  vi.mocked(platformSettings.public).mockResolvedValue({
    supportEmail: "",
    supportPhone: "",
    supportHours: "",
    noticeEnabled: false,
    noticeText: "Unpublished draft",
  });
  const client = mount();
  await waitFor(() =>
    expect(client.getQueryState(["public-platform-settings"])?.status).toBe("success"),
  );
  expect(screen.queryByText("Unpublished draft")).toBeNull();
});
