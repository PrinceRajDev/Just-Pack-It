export type ServiceArea = { id: string; name: string; city: string; pincodes: string[]; active: boolean };
export type Category = { id: string; slug: string; name: string; blurb?: string; image?: string };
export type Shop = { id: string; slug: string; name: string; locality: string; tagline?: string; description?: string; isOpen: boolean; initials?: string; coverImage?: string; deliveryFee?: number; minimumOrderAmount?: number };
export type ProductVariant = { id: string; label: string; price: number; stock: number };
export type Product = { id: string; productId?: string; variantId?: string; variants?: ProductVariant[]; name: string; unit: string; price: number; stock: number; description?: string; image?: string; shopId: string; categorySlug?: string; tags?: string[] };
export type Session = { userId: string; name: string; role: "buyer" | "seller" | "delivery" | "admin"; token: string; isDemo: false };
export type Address = { id: string; label: string; line1: string; locality: string; city: string; pincode: string; version: number };
export type CheckoutLine = { productId: string; variantId?: string; qty: number };
export type CheckoutReview = { checkoutAvailable: boolean; itemsSubtotal: number; deliveryTotal: number | null; grandTotal: number | null; paymentMethods: string[]; issues: { message: string }[]; lines: { issues: { message: string }[] }[]; shops: { shop: Shop; issues: { message: string }[] }[]; fulfilments: { shopId: string; listedFee: number | null; issues: { message: string }[] }[] };
export type BuyerProfile = { name: string; phone: string; email?: string; emailVerified: boolean; version: number };
export type BuyerOrder = { id: string; total: number; amountDue?: number; cancelledAmount?: number; paymentStatus: string; paymentMethod: string; createdAt: string; address: { label: string; line1: string; locality: string; city: string; pincode: string }; subOrders: { id: string; shopName: string; status: string; deliveryState?: string; amountDue: number; deliveryFee: number; cancelReason?: string; lines: { productId: string; variantId?: string; variantLabel?: string; name: string; unit: string; qty: number; price: number }[] }[] };

type ListPayload<T> = T[] | { items?: T[] };
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const sessionListeners = new Set<(token: string) => void>();
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch {
    throw new Error(controller.signal.aborted
      ? "The request timed out. Check your connection and retry. If placing an order, check Your orders or retry the same checkout."
      : "We could not reach Just Pack It. Check your internet and retry.");
  } finally { clearTimeout(timer); }
}
export function onSessionExpired(listener: (token: string) => void) { sessionListeners.add(listener); return () => { sessionListeners.delete(listener); }; }

function asList<T>(payload: ListPayload<T>, resource: string): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  throw new Error(`The ${resource} response was not in the expected format.`);
}

async function get<T>(path: string): Promise<T> {
  if (!apiUrl) throw new Error("The marketplace connection is missing. Please install the latest app build.");
  let response: Response;
  try { response = await fetchWithTimeout(`${apiUrl}${path}`, { headers: { Accept: "application/json" } }); }
  catch (reason) { throw reason instanceof Error ? reason : new Error("Check your internet and try again."); }
  if (!response.ok) throw new Error(`Marketplace request failed (${response.status}). Please try again.`);
  return response.json() as Promise<T>;
}

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error("The marketplace connection is missing. Please install the latest app build.");
  let response: Response;
  try {
    response = await fetchWithTimeout(`${apiUrl}${path}`, { ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
  } catch (reason) { throw reason instanceof Error ? reason : new Error("Check your internet and try again."); }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) {
    if (response.status === 401 && token) sessionListeners.forEach((listener) => listener(token));
    throw new ApiError(payload.message || `Marketplace request failed (${response.status}). Please try again.`, response.status);
  }
  return payload as T;
}

async function getList<T>(path: string, resource: string): Promise<T[]> {
  return asList(await get<ListPayload<T>>(path), resource);
}

async function searchPage<T>(kind: "products" | "shops", areaId: string, text: string, cursor?: string) {
  if (!apiUrl) throw new Error("Marketplace connection is missing");
  const query = `area=${encodeURIComponent(areaId)}&q=${encodeURIComponent(text.trim())}&limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const response = await fetchWithTimeout(`${apiUrl}/${kind}?${query}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Search could not load. Please retry.");
  return { items: asList<T>(await response.json() as ListPayload<T>, kind), cursor: response.headers.get("X-Has-More") === "true" ? response.headers.get("X-Next-Cursor") : null };
}
export const marketApi = {
  searchProducts: (areaId: string, text: string, cursor?: string) => searchPage<Product>("products", areaId, text, cursor),
  searchShops: (areaId: string, text: string, cursor?: string) => searchPage<Shop>("shops", areaId, text, cursor),
  async shopPage(shopId: string, cursor?: string) {
    if (!apiUrl) throw new Error("Marketplace connection is missing");
    const response = await fetchWithTimeout(`${apiUrl}/shops/${encodeURIComponent(shopId)}/products?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Shop products could not load. Please retry.");
    return { items: asList<Product>(await response.json() as ListPayload<Product>, "shop products"), cursor: response.headers.get("X-Has-More") === "true" ? response.headers.get("X-Next-Cursor") : null };
  },
  async categoryPage(areaId: string, slug: string, cursor?: string) {
    if (!apiUrl) throw new Error("Marketplace connection is missing");
    const query = `area=${encodeURIComponent(areaId)}&category=${encodeURIComponent(slug)}&limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await fetchWithTimeout(`${apiUrl}/products?${query}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Products could not load. Please retry.");
    return { items: asList<Product>(await response.json() as ListPayload<Product>, "products"), cursor: response.headers.get("X-Has-More") === "true" ? response.headers.get("X-Next-Cursor") : null };
  },
  categoryProducts: (areaId: string, slug: string) => getList<Product>(`/products?area=${encodeURIComponent(areaId)}&category=${encodeURIComponent(slug)}&limit=100`, "category products"),
  shops: (areaId: string) => getList<Shop>(`/shops?area=${encodeURIComponent(areaId)}&limit=100`, "shops"),
  shopProducts: (shopId: string) => getList<Product>(`/shops/${encodeURIComponent(shopId)}/products?limit=100`, "shop products"),
  async search(areaId: string, text: string) {
    const [products, shops] = await Promise.all([
      searchPage<Product>("products", areaId, text),
      searchPage<Shop>("shops", areaId, text),
    ]);
    return { products: products.items, shops: shops.items, productCursor: products.cursor, shopCursor: shops.cursor };
  },
  async loadHome(areaId?: string) {
    const areas = await getList<ServiceArea>("/areas", "delivery areas");
    const query = areaId ? `?area=${encodeURIComponent(areaId)}&limit=24` : "?limit=24";
    const [categories, shops, products] = await Promise.all([
      getList<Category>("/categories", "categories"),
      areaId ? getList<Shop>(`/shops${query}`, "shops") : Promise.resolve([]),
      areaId ? getList<Product>(`/products${query}`, "products") : Promise.resolve([]),
    ]);
    return { areas, categories, shops, products };
  },
};

export const buyerApi = {
  cancelSuborder: (token: string, orderId: string, subId: string, version: number, reason: string) => request<void>(`/orders/${encodeURIComponent(orderId)}/suborders/${encodeURIComponent(subId)}/cancel`, token, { method: "POST", body: JSON.stringify({ version, reason }) }),
  async ordersPage(token: string, cursor?: string) {
    if (!apiUrl) throw new Error("Marketplace connection is missing");
    const response = await fetchWithTimeout(`${apiUrl}/orders?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    if (response.status === 401) sessionListeners.forEach((listener) => listener(token));
    if (!response.ok) throw new Error("Orders could not load. Please retry.");
    return { items: asList<BuyerOrder>(await response.json() as ListPayload<BuyerOrder>, "orders"), cursor: response.headers.get("X-Has-More") === "true" ? response.headers.get("X-Next-Cursor") : null };
  },
  recoveryCode: (email: string) => request<{ challengeId: string; expiresAt: string; resendAfterSeconds: number }>("/auth/password-recovery/request", undefined, { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (input: { email: string; emailChallengeId: string; emailOtp: string; newPassword: string }) => request<void>("/auth/password-recovery/reset", undefined, { method: "POST", body: JSON.stringify(input) }),
  registrationOptions: () => request<{ emailOtpRequired: boolean; emailOtpAvailable: boolean }>("/auth/registration-options"),
  sendEmailOtp: (email: string) => request<{ challengeId: string; expiresAt: string; resendAfterSeconds: number }>("/auth/email-otp/send", undefined, { method: "POST", body: JSON.stringify({ email }) }),
  receiptCode: (token: string, orderId: string, subId: string, version: number, cod: boolean) => request<{ code: string; expiresAt: string; amount: number }>(`/orders/${encodeURIComponent(orderId)}/suborders/${encodeURIComponent(subId)}/receipt-code`, token, { method: "POST", body: JSON.stringify({ version, confirmReceived: true, ...(cod ? { confirmCashPaid: true } : {}) }) }),
  order: (token: string, id: string) => request<BuyerOrder>(`/orders/${encodeURIComponent(id)}`, token),
  placeCod: (token: string, key: string, input: { areaId: string; addressId: string; addressVersion: number; expectedTotal: number; paymentMethod: "cod"; items: CheckoutLine[]; fulfilments: { shopId: string; method: "platform_delivery" }[] }) => request<BuyerOrder>("/orders", token, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(input) }),
  reviewCheckout: (token: string, areaId: string, address: Address, items: CheckoutLine[], shopIds: string[]) => request<CheckoutReview>("/checkout/review", token, { method: "POST", body: JSON.stringify({ areaId, addressId: address.id, addressVersion: address.version, items, fulfilments: shopIds.map((shopId) => ({ shopId, method: "platform_delivery" })) }) }),
  login: (phone: string, password: string) => request<Session>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ phone, password }) }),
  register: (name: string, phone: string, password: string, proof?: { email: string; emailChallengeId: string; emailOtp: string }) => request<Session>("/auth/register", undefined, { method: "POST", body: JSON.stringify({ name, phone, password, ...proof }) }),
  me: (token: string) => request<Omit<Session, "token">>("/auth/me", token),
  logout: (token: string) => request<void>("/auth/logout", token, { method: "POST" }),
  profile: (token: string) => request<BuyerProfile>("/auth/profile", token),
  updateProfile: (token: string, name: string, version: number) => request<BuyerProfile>("/auth/profile", token, { method: "PATCH", body: JSON.stringify({ name, version }) }),
  addresses: (token: string) => request<Address[]>("/addresses", token),
  createAddress: (token: string, input: Omit<Address, "id" | "version">) => request<Address>("/addresses", token, { method: "POST", body: JSON.stringify(input) }),
  updateAddress: (token: string, id: string, input: Omit<Address, "id">) => request<Address>(`/addresses/${id}`, token, { method: "PATCH", body: JSON.stringify(input) }),
  deleteAddress: (token: string, id: string, version: number) => request<void>(`/addresses/${id}`, token, { method: "DELETE", body: JSON.stringify({ version }) }),
  orders: (token: string) => request<BuyerOrder[]>("/orders?limit=30", token),
};
