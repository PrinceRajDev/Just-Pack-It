import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { Attributes, attributes } from "@/components/portal/management-shared";
import { management } from "@/services/management";
import { productImages } from "@/services/product-images";
import type { ManagedProduct, ManagedShop, ProductInput } from "@/domain/management";
vi.mock("@/lib/config", () => ({
  config: { apiUrl: "http://api.test", imageBaseUrl: "" },
  isDemoMode: false,
}));
const respond = (value: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe("Live management contracts", () => {
  it("uploads the raw file with its content type and product version, not client ownership", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ id: "p", version: 4 }));
    vi.stubGlobal("fetch", fetcher);
    const file = new File(["test-bytes"], "image.png", { type: "image/png" });
    await productImages.upload({ id: "p", version: 3 } as ManagedProduct, file);
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/seller/products/p/image");
    expect(fetcher.mock.calls[0][1].body).toBe(file);
    expect(fetcher.mock.calls[0][1].headers["Content-Type"]).toBe("image/png");
    expect(fetcher.mock.calls[0][1].headers["X-Product-Version"]).toBe("3");
  });
  it("sends review reasons with the admin decision and expected version", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ status: "rejected" }));
    vi.stubGlobal("fetch", fetcher);
    await management.approve(
      { id: "shop-id", version: 4 } as ManagedShop,
      "rejected",
      "Correct the shop address",
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      status: "rejected",
      version: 4,
      reason: "Correct the shop address",
    });
  });
  it("creates sellers through the admin endpoint without submitting a client role", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ id: "s", role: "seller", active: true }));
    vi.stubGlobal("fetch", fetcher);
    const input = { name: "Test seller", phone: "+919876543210", password: "Test-only-password" };
    await management.createSeller(input);
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/admin/sellers");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
  });
  it("only treats an explicit missing shop as onboarding, never permission failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond({ code: "SHOP_NOT_FOUND" }, 404))
        .mockResolvedValueOnce(respond({ code: "FORBIDDEN" }, 403)),
    );
    expect(await management.shop()).toBeNull();
    await expect(management.shop()).rejects.toMatchObject({ status: 403 });
  });
  it("uses an owner-scoped product path and parent version without sending shop ownership", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ id: "p", version: 8 }));
    vi.stubGlobal("fetch", fetcher);
    const input: ProductInput = {
      name: "Listing",
      unit: "piece",
      description: "",
      categoryId: "c",
      price: 25,
      stock: 4,
      active: true,
      attributes: [],
      image: null,
      subcategoryId: null,
    };
    await management.saveProduct(input, {
      id: "p",
      shopId: "private-owner",
      version: 7,
    } as ManagedProduct);
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/seller/products/p");
    expect(fetcher.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ ...input, version: 7 });
  });
  it("preserves variant identity and scopes mutations to the product", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ version: 4 }));
    vi.stubGlobal("fetch", fetcher);
    await management.variant(
      { id: "p-one", version: 3 } as ManagedProduct,
      { label: "500 g", price: 49, stock: 8, attributes: [] },
      "variant-one",
    );
    expect(fetcher.mock.calls[0][0]).toBe(
      "http://api.test/seller/products/p-one/variants/variant-one",
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      version: 3,
      label: "500 g",
      price: 49,
      stock: 8,
      attributes: [],
    });
  });
  it("surfaces version conflicts without retrying a write", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(respond({ message: "Changed", code: "VERSION_CONFLICT" }, 409));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      management.approve({ id: "s", version: 2 } as ManagedShop, "approved"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("sends approval status and version without changing the shop owner", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ status: "approved" }));
    vi.stubGlobal("fetch", fetcher);
    await management.approve({ id: "shop-id", version: 9 } as ManagedShop, "approved");
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/admin/shops/shop-id/approval");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ status: "approved", version: 9 });
  });
  it("keeps taxonomy references and version in their parent scope", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({}, 204));
    vi.stubGlobal("fetch", fetcher);
    await management.removeVariant({ id: "p", version: 6 } as ManagedProduct, "v");
    expect(fetcher.mock.calls[0][1].method).toBe("DELETE");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ version: 6 });
  });
  it("retains typed attribute values when a preceding row is removed", () => {
    const { container } = render(
      <form>
        <Attributes
          values={[
            { label: "Size", value: "M" },
            { label: "Colour", value: "Blue" },
          ]}
        />
      </form>,
    );
    fireEvent.change(screen.getAllByLabelText("Value")[1], { target: { value: "Green" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove detail 1" }));
    expect(attributes(new FormData(container.querySelector("form")!))).toEqual([
      { label: "Colour", value: "Green" },
    ]);
  });
});
