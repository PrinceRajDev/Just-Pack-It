import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDraftAssistant } from "@/components/portal/ProductDraftAssistant";
import { productDraft } from "@/services/product-draft";
vi.mock("@/services/product-draft", () => ({
  productDraft: { capability: vi.fn(), generate: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount(file: File | null, onApply = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProductDraftAssistant file={file} onApply={onApply} />
    </QueryClientProvider>,
  );
  return onApply;
}
it("requires a photo and never calls the provider automatically", async () => {
  vi.mocked(productDraft.capability).mockResolvedValue({ enabled: true });
  mount(null);
  expect(await screen.findByRole("button", { name: "AI se details bharo" })).toBeDisabled();
  expect(productDraft.generate).not.toHaveBeenCalled();
});
it("requires explicit review and apply before changing fields", async () => {
  vi.mocked(productDraft.capability).mockResolvedValue({ enabled: true });
  const draft = { name: "Rice", description: "Rice pack", unit: "", categoryId: "c" };
  vi.mocked(productDraft.generate).mockResolvedValue(draft);
  const apply = mount(new File(["photo"], "photo.png", { type: "image/png" }));
  fireEvent.click(await screen.findByRole("button", { name: "AI se details bharo" }));
  const use = await screen.findByRole("button", { name: "Fill empty fields with this draft" });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(use);
  expect(apply).toHaveBeenCalledWith(draft);
});
it("keeps manual entry available on provider failure without applying a fake draft", async () => {
  vi.mocked(productDraft.capability).mockResolvedValue({ enabled: true });
  vi.mocked(productDraft.generate).mockRejectedValue(new Error("Try manually"));
  const apply = mount(new File(["photo"], "photo.png", { type: "image/png" }));
  fireEvent.click(await screen.findByRole("button", { name: "AI se details bharo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try manually");
  expect(apply).not.toHaveBeenCalled();
});
