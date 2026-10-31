import { discoverShops, type ShopSearch } from "@/lib/shop-discovery";
// Catalogue service. Mock implementation while no backend; real calls via api().
// Expected endpoints (assumption): GET /shops, GET /shops/:slug, GET /products?q&category&shop&sort, GET /products/:id
import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import { api, apiResponse, ApiError, delay } from "@/lib/api/client";
import type { GpsPoint } from "@/services/location";
import { isDemoMode } from "@/lib/config";
import * as mock from "@/mocks/data";
import type { Category, Product, Shop, ServiceArea } from "@/domain/types";
import { validOffer } from "@/lib/offers";
import { searchMatches } from "@/lib/search";

export type SortKey = "relevance" | "price_asc" | "price_desc" | "name";
const loadedShops = new Map<string, Shop>();
const loadedProducts = new Map<string, Product>();
function cacheShops(shops: Shop[]) {
  shops.forEach((shop) => loadedShops.set(shop.id, shop));
  while (loadedShops.size > 10000) loadedShops.delete(loadedShops.keys().next().value!);
  return shops;
}
function cacheProducts(products: Product[]) {
  products.forEach((product) => loadedProducts.set(product.id, product));
  while (loadedProducts.size > 10000) loadedProducts.delete(loadedProducts.keys().next().value!);
  return products;
}
/** Public DTOs returned by server cart review; never populated from local cart storage. */
export function rememberReviewedCatalogue(products: Product[], shops: Shop[]) {
  cacheProducts(products);
  cacheShops(shops);
}
async function nullable<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export interface ProductQuery {
  lat?: number;
  lng?: number;
  area?: string;
  q?: string;
  category?: string;
  shop?: string;
  sort?: SortKey;
  inStockOnly?: boolean;
  offersOnly?: boolean;
}

function filterProducts(query: ProductQuery): Product[] {
  const q = query.q?.trim().toLowerCase();
  let list = mock.products.filter((p) => {
    if (
      query.area &&
      !mock.shops.some((s) => s.id === p.shopId && s.serviceAreaIds?.includes(query.area!))
    )
      return false;
    if (query.category && p.categorySlug !== query.category) return false;
    if (query.shop && p.shopId !== query.shop) return false;
    if (
      query.inStockOnly &&
      !(p.variants?.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0)
    )
      return false;
    if (query.offersOnly && !validOffer(p.offer)) return false;
    if (q && !searchMatches(`${p.name} ${p.description}`, q)) return false;
    return true;
  });
  if (query.sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price);
  if (query.sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
  if (query.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

export interface CataloguePage<T> {
  items: T[];
  next?: string;
  total?: number;
}
export interface ShopQuery extends ShopSearch {
  area?: string;
  lat?: number;
  lng?: number;
  category?: string;
}
const pageParams = (query: object, cursor?: string) =>
  new URLSearchParams(
    Object.entries({ ...query, limit: 24, ...(cursor ? { cursor } : {}) })
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
async function publicPage<T>(
  path: string,
  query: object,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CataloguePage<T>> {
  const result = await apiResponse<T[]>(`${path}?${pageParams(query, cursor)}`, { signal });
  const next = result.headers.get("X-Next-Cursor") ?? undefined;
  if (
    !Array.isArray(result.data) ||
    (result.headers.get("X-Has-More") === "true" && !next) ||
    (next === cursor && !!next)
  )
    throw new ApiError(
      "Catalogue pagination could not be verified. Retry this page.",
      502,
      "INVALID_PAGINATION",
    );
  const total = result.headers.get("X-Total-Count");
  return {
    items: result.data,
    next,
    total: total && /^\d+$/.test(total) ? Number(total) : undefined,
  };
}
const shopRequests = new Map<string, Promise<void>>();
async function hydrateShops(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => !loadedShops.has(id));
  if (!missing.length) return;
  const key = missing.sort().join(",");
  let pending = shopRequests.get(key);
  if (!pending) {
    pending = api<Shop[]>(`/catalogue/shops/by-ids?${new URLSearchParams({ ids: key })}`)
      .then((shops) => {
        cacheShops(shops);
      })
      .finally(() => shopRequests.delete(key));
    shopRequests.set(key, pending);
  }
  await pending;
}
function demoPage<T>(items: T[], cursor?: string): CataloguePage<T> {
  const start = Number(cursor ?? 0);
  return {
    items: items.slice(start, start + 24),
    next: start + 24 < items.length ? String(start + 24) : undefined,
    total: items.length,
  };
}
export const catalog = {
  async areas(): Promise<ServiceArea[]> {
    if (isDemoMode) return mock.serviceAreas;
    return api("/areas");
  },
  async categories(): Promise<Category[]> {
    if (isDemoMode) return mock.categories;
    return api("/categories");
  },
  async shopPage(
    query: ShopQuery,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CataloguePage<Shop>> {
    if (isDemoMode) {
      const scoped = query.area
        ? mock.shops.filter((shop) => shop.serviceAreaIds?.includes(query.area!))
        : mock.shops;
      const items = query.category ? discoverShops(scoped, query.category, query) : scoped;
      return demoPage(items, cursor);
    }
    if (!query.area) return { items: [] };
    const page = await publicPage<Shop>("/shops", query, cursor, signal);
    cacheShops(page.items);
    return page;
  },
  async shops(area?: string, gps?: GpsPoint | null): Promise<Shop[]> {
    return (await catalog.shopPage({ area, ...gps })).items;
  },
  async shop(slug: string): Promise<Shop | null> {
    if (isDemoMode) return (await delay(150), mock.shops.find((s) => s.slug === slug) ?? null);
    const shop = await nullable(() => api<Shop>(`/shops/${encodeURIComponent(slug)}`));
    if (shop) cacheShops([shop]);
    return shop;
  },
  async productPage(
    query: ProductQuery,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CataloguePage<Product>> {
    if (isDemoMode) return demoPage(filterProducts(query), cursor);
    if (!query.area && !query.shop) return { items: [] };
    const page = await publicPage<Product>("/products", query, cursor, signal);
    await hydrateShops(page.items.map((product) => product.shopId));
    cacheProducts(page.items);
    return page;
  },
  async products(query: ProductQuery, signal?: AbortSignal): Promise<Product[]> {
    return (await catalog.productPage(query, undefined, signal)).items;
  },
  async product(id: string): Promise<Product | null> {
    if (isDemoMode) return (await delay(150), mock.products.find((p) => p.id === id) ?? null);
    const product = await nullable(() => api<Product>(`/products/${encodeURIComponent(id)}`));
    if (product) {
      cacheProducts([product]);
      await hydrateShops([product.shopId]);
      if (!loadedShops.has(product.shopId)) return null;
    }
    return product;
  },
};

// Synchronous lookups for already-loaded demo data (shop name on product cards).
export const shopById = (id: string) =>
  isDemoMode ? mock.shops.find((s) => s.id === id) : loadedShops.get(id);
export const productById = (id: string) =>
  isDemoMode ? mock.products.find((p) => p.id === id) : loadedProducts.get(id);

export const areasQuery = () =>
  queryOptions({ queryKey: ["areas"], queryFn: catalog.areas, staleTime: 300000 });
export const shopsQuery = (area?: string, gps?: GpsPoint | null) =>
  queryOptions({
    queryKey: ["shops", area, gps],
    queryFn: () => catalog.shops(area, gps),
    staleTime: 30000,
  });
export const shopQuery = (slug: string) =>
  queryOptions({
    queryKey: ["shop", slug],
    queryFn: () => catalog.shop(slug),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
export const productsQuery = (q: ProductQuery) =>
  queryOptions({
    queryKey: ["products", q],
    queryFn: ({ signal }) => catalog.products(q, signal),
    staleTime: 15000,
  });
export const productQuery = (id: string) =>
  queryOptions({ queryKey: ["product", id], queryFn: () => catalog.product(id) });
export const categoriesQuery = () =>
  queryOptions({ queryKey: ["categories"], queryFn: catalog.categories, staleTime: 300000 });

export const productPagesQuery = (query: ProductQuery) =>
  infiniteQueryOptions({
    queryKey: ["products", "pages", query],
    queryFn: ({ pageParam, signal }) => catalog.productPage(query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next,
    enabled: isDemoMode || !!query.area || !!query.shop,
    staleTime: 15000,
    retry: false,
  });
export const shopPagesQuery = (query: ShopQuery) =>
  infiniteQueryOptions({
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryKey: ["shops", "pages", query],
    queryFn: ({ pageParam, signal }) => catalog.shopPage(query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next,
    enabled: isDemoMode || !!query.area,
    staleTime: 30000,
    retry: false,
  });
