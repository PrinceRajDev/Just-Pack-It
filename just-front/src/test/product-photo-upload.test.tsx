import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductPhotoUpload } from "@/components/portal/ProductPhotoUpload";
import { productImages } from "@/services/product-images";
import { ApiError } from "@/lib/api/client";
import type { ManagedProduct } from "@/domain/management";
vi.mock("@/services/product-images", () => ({
  productImages: { capability: vi.fn(), upload: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({ useBlocker: () => ({ status: "idle" }) }));
const originalURL = URL;
const product: ManagedProduct = {
  id: "p",
  shopId: "s",
  name: "Listing",
  unit: "pack",
  description: "",
  categoryId: "c",
  categorySlug: "grocery",
  stock: 2,
  price: 10,
  active: true,
  version: 3,
};
beforeEach(() => {
  vi.mocked(productImages.capability).mockResolvedValue({
    enabled: true,
    maxBytes: 5 * 1024 * 1024,
    types: ["image/png", "image/jpeg", "image/webp"],
  });
  vi.stubGlobal(
    "URL",
    Object.assign(class extends originalURL {}, {
      createObjectURL: vi.fn(() => "blob:photo-preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function mount(disabled = false) {
  const editing = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProductPhotoUpload product={product} disabled={disabled} onEditing={editing} />
    </QueryClientProvider>,
  );
  return editing;
}
describe("Product photo upload UI", () => {
  it("shows unavailable storage honestly without a fake upload action", async () => {
    vi.mocked(productImages.capability).mockResolvedValue({
      enabled: false,
      maxBytes: 5242880,
      types: [],
    });
    mount();
    expect(await screen.findByText(/Photo uploads are not configured/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose product photo")).not.toBeInTheDocument();
    expect(productImages.upload).not.toHaveBeenCalled();
  });
  it("previews a selected file and saves against the current product version", async () => {
    vi.mocked(productImages.upload).mockResolvedValue({
      ...product,
      version: 4,
      image: "https://imagedelivery.net/test/image/public",
    });
    const editing = mount();
    const file = new File(["test image bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Choose product photo"), {
      target: { files: [file] },
    });
    expect(await screen.findByAltText("Selected product photo preview")).toBeInTheDocument();
    expect(editing).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Upload and save photo" }));
    await waitFor(() => expect(productImages.upload).toHaveBeenCalledWith(product, file));
    await waitFor(() => expect(editing).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole("button", { name: "Upload and save photo" })).toBeDisabled();
  });
  it("rejects oversized files and unsupported types before making a request", async () => {
    mount();
    const input = await screen.findByLabelText("Choose product photo");
    fireEvent.change(input, {
      target: { files: [new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP");
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("no larger than 5 MiB");
    expect(productImages.upload).not.toHaveBeenCalled();
  });
  it("preserves the selected file and shows a conflict rather than claiming success", async () => {
    vi.mocked(productImages.upload).mockRejectedValue(
      new ApiError("Changed", 409, "VERSION_CONFLICT"),
    );
    const editing = mount();
    fireEvent.change(await screen.findByLabelText("Choose product photo"), {
      target: { files: [new File(["bytes"], "photo.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload and save photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.getByRole("button", { name: "Discard selected photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload and save photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh saved photo and listing" })).toBeEnabled();
    expect(editing).toHaveBeenLastCalledWith(true);
  });
  it("prevents upload while listing or variant changes are unsaved", async () => {
    mount(true);
    expect(await screen.findByLabelText("Choose product photo")).toBeDisabled();
    expect(screen.getByText(/Save your listing or option changes/)).toBeInTheDocument();
  });
  it("blocks blind retry after a lost response and allows explicit saved-state refresh", async () => {
    vi.mocked(productImages.upload).mockRejectedValue(
      new ApiError("Connection lost", 0, "NETWORK"),
    );
    mount();
    fireEvent.change(await screen.findByLabelText("Choose product photo"), {
      target: { files: [new File(["bytes"], "photo.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload and save photo" }));
    const refresh = await screen.findByRole("button", { name: "Refresh saved photo and listing" });
    expect(screen.getByLabelText("Choose product photo")).toBeDisabled();
    expect(productImages.upload).toHaveBeenCalledTimes(1);
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(screen.queryByAltText("Selected product photo preview")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Choose product photo")).toBeEnabled();
    expect(productImages.upload).toHaveBeenCalledTimes(1);
  });
});
