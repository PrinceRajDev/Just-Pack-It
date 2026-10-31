import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlatformSettingsPage } from "@/components/portal/PlatformSettingsPage";
import { platformSettings } from "@/services/platform-settings";
import type { PlatformSettings } from "@/domain/platform-settings";
vi.mock("@/services/platform-settings", () => ({
  platformSettings: { get: vi.fn(), save: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const data: PlatformSettings = {
  version: 0,
  updatedAt: null,
  supportEmail: "",
  supportPhone: "",
  supportHours: "",
  noticeEnabled: false,
  noticeText: "",
  configuration: {
    codEnabled: true,
    onlineEnabled: false,
    paymentMode: "disabled",
    refundsEnabled: false,
    platformDeliveryEnabled: false,
    emailOtpRequired: true,
    emailConfigured: false,
    pushEnabled: false,
    imageProvider: "r2",
    imageConfigured: false,
    inventoryWorkerEnabled: false,
    paymentWorkerEnabled: false,
  },
};
function mount() {
  vi.mocked(platformSettings.get).mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlatformSettingsPage />
    </QueryClientProvider>,
  );
  return client;
}
it("publishes only after reason and confirmation with exact expected version", async () => {
  vi.mocked(platformSettings.save).mockResolvedValue({
    ...data,
    version: 1,
    supportEmail: "help@qa.invalid",
  });
  mount();
  await screen.findByLabelText("Support email");
  fireEvent.change(screen.getByLabelText("Support email"), {
    target: { value: "help@qa.invalid" },
  });
  expect(screen.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for publishing"), {
    target: { value: "QA approved support address" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
  expect(platformSettings.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
  await waitFor(() =>
    expect(platformSettings.save).toHaveBeenCalledWith(
      {
        supportEmail: "help@qa.invalid",
        supportPhone: "",
        supportHours: "",
        noticeEnabled: false,
        noticeText: "",
      },
      0,
      "QA approved support address",
    ),
  );
  await screen.findByText(/No unpublished changes/);
});
it("retains a dirty draft when another admin version arrives and blocks silent overwrite", async () => {
  const client = mount();
  await screen.findByLabelText("Support hours");
  fireEvent.change(screen.getByLabelText("Support hours"), {
    target: { value: "QA unsaved hours" },
  });
  fireEvent.change(screen.getByLabelText("Reason for publishing"), {
    target: { value: "QA proposed support update" },
  });
  act(() =>
    client.setQueryData(["platform-settings"], {
      ...data,
      version: 1,
      supportHours: "Another admin value",
    }),
  );
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Support hours")).toHaveValue("QA unsaved hours");
  expect(screen.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  expect(platformSettings.save).not.toHaveBeenCalled();
});
it("retains text after a failed publication and never displays fake success", async () => {
  vi.mocked(platformSettings.save).mockRejectedValue(new Error("Settings version conflict"));
  mount();
  await screen.findByLabelText("Support hours");
  fireEvent.change(screen.getByLabelText("Support hours"), {
    target: { value: "QA proposed hours" },
  });
  fireEvent.change(screen.getByLabelText("Reason for publishing"), {
    target: { value: "QA approved operations hours" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Support hours")).toHaveValue("QA proposed hours");
  expect(screen.getByRole("button", { name: "Publish changes" })).toBeDisabled();
});
