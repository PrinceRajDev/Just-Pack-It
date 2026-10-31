import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import { catalog, productPagesQuery, shopPagesQuery } from "@/services/catalog";
import { api, apiResponse } from "@/lib/api/client";
vi.mock("@/lib/config", () => ({ isDemoMode: false, config: { apiUrl: "http://test" } }));
vi.mock("@/lib/api/client", () => ({
  api: vi.fn(),
  apiResponse: vi.fn(),
  delay: vi.fn(),
  ApiError: class extends Error {
    code: string;
    constructor(message: string, _status: number, code: string) {
      super(message);
      this.code = code;
    }
  },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function response(items: unknown[], next?: string, total = 30) {
  return {
    data: items,
    headers: new Headers({
      "X-Has-More": String(!!next),
      "X-Total-Count": String(total),
      ...(next ? { "X-Next-Cursor": next } : {}),
    }),
  };
}
it("does not make broad list requests without an area or explicit shop", async () => {
  expect(await catalog.shops()).toEqual([]);
  expect(await catalog.products({})).toEqual([]);
  expect(apiResponse).not.toHaveBeenCalled();
  expect(productPagesQuery({}).enabled).toBe(false);
  expect(shopPagesQuery({}).enabled).toBe(false);
});
it("fetches one bounded page and does not follow its cursor eagerly", async () => {
  vi.mocked(apiResponse).mockResolvedValue(response([{ id: "s" }], "cursor-two"));
  const page = await catalog.shopPage({
    area: "a",
    category: "fruit",
    sort: "fee_asc",
    openOnly: true,
  });
  expect(page.next).toBe("cursor-two");
  expect(page.total).toBe(30);
  expect(apiResponse).toHaveBeenCalledTimes(1);
  const path = vi.mocked(apiResponse).mock.calls[0][0];
  const url = new URL(path, "http://test");
  expect(url.searchParams.get("area")).toBe("a");
  expect(url.searchParams.get("category")).toBe("fruit");
  expect(url.searchParams.get("limit")).toBe("24");
  expect(url.searchParams.get("cursor")).toBeNull();
});
it("hydrates only owning shops for returned product page, never the broad shop list", async () => {
  vi.mocked(apiResponse).mockResolvedValue(response([{ id: "p", shopId: "owner-page" }], "next"));
  vi.mocked(api).mockResolvedValue([{ id: "owner-page", slug: "owner" }]);
  await catalog.productPage({ area: "a", q: "rice" });
  expect(apiResponse).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api).mock.calls[0][0]).toContain("/catalogue/shops/by-ids?ids=owner-page");
});
it("rejects missing and repeated next-cursor headers", async () => {
  vi.mocked(apiResponse).mockResolvedValue({
    data: [],
    headers: new Headers({ "X-Has-More": "true" }),
  });
  await expect(catalog.shopPage({ area: "a" })).rejects.toMatchObject({
    code: "INVALID_PAGINATION",
  });
  vi.mocked(apiResponse).mockResolvedValue(response([], "same"));
  await expect(catalog.shopPage({ area: "a" }, "same")).rejects.toMatchObject({
    code: "INVALID_PAGINATION",
  });
});
function Probe({ area }: { area: string }) {
  const q = useInfiniteQuery(shopPagesQuery({ area }));
  return (
    <>
      <output>
        {q.data?.pages
          .flatMap((p) => p.items)
          .map((s) => s.id)
          .join(",")}
      </output>
      {q.isFetchNextPageError && <p role="alert">next failed</p>}
      <button onClick={() => void q.fetchNextPage()}>More</button>
    </>
  );
}
it("loads next only on demand, preserves previous pages on failure, and resets area cursor", async () => {
  vi.mocked(apiResponse).mockImplementation(async (path) => {
    const url = new URL(path, "http://test");
    if (url.searchParams.get("area") === "b")
      return response([{ id: "area-b" }], undefined, 1) as never;
    if (url.searchParams.has("cursor")) throw new Error("offline");
    return response([{ id: "area-a" }], "next") as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <Probe area="a" />
    </QueryClientProvider>,
  );
  await screen.findByText("area-a");
  expect(apiResponse).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("More"));
  await screen.findByRole("alert");
  expect(screen.getByText("area-a")).toBeInTheDocument();
  rerender(
    <QueryClientProvider client={client}>
      <Probe area="b" />
    </QueryClientProvider>,
  );
  await screen.findByText("area-b");
  expect(screen.queryByText("area-a")).toBeNull();
  await waitFor(() =>
    expect(vi.mocked(apiResponse).mock.calls.at(-1)?.[0]).not.toContain("cursor="),
  );
  client.clear();
});
