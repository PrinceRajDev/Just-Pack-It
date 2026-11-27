import type { OpeningInterval } from "./shopHours";

export type ServiceArea = { id: string; name: string; city: string; pincodes: string[]; active: boolean };
export type Category = { id: string; slug: string; name: string; blurb?: string; image?: string; subcategories?: { slug: string; name: string }[] };
export type Shop = { id: string; slug: string; name: string; locality: string; categories?: string[]; rating?: number; distanceKm?: number; tagline?: string; description?: string; isOpen: boolean; initials?: string; coverImage?: string; fulfilment?: string[]; deliveryFee?: number; minimumOrderAmount?: number; openingHours?: OpeningInterval[]; timezone?: string; availability?: string };
export type ProductVariant = { id: string; label: string; price: number; stock: number };
export type Product = { id: string; productId?: string; variantId?: string; variants?: ProductVariant[]; name: string; unit: string; price: number; stock: number; description?: string; image?: string; shopId: string; categorySlug?: string; tags?: string[] };
export type Session = { userId: string; name: string; role: "buyer" | "seller" | "delivery" | "admin"; token: string; isDemo: false };
export type Address = { id: string; label: string; line1: string; locality: string; city: string; pincode: string; location?: {type:"Point";coordinates:[number,number]}; version: number };
export type CheckoutLine = { productId: string; variantId?: string; qty: number };
export type CheckoutReview = { checkoutAvailable: boolean; itemsSubtotal: number; deliveryTotal: number | null; grandTotal: number | null; paymentMethods: string[]; issues: { code?: string; message: string }[]; lines: { productId?: string; variantId?: string; unitPrice?: number; availableStock?: number; issues: { code?: string; message: string }[] }[]; shops: { shop: Shop; issues: { code?: string; message: string }[] }[]; fulfilments: { shopId: string; listedFee: number | null; issues: { code?: string; message: string }[] }[] };
export type BuyerProfile = { name: string; phone: string; email?: string; emailVerified: boolean; version: number };
export type OrderItemChange = {
  state: "pending" | "replaced" | "removed";
  original: {name:string; unit:string; variantLabel?:string; qty:number; price:number};
  replacement?: {name:string; unit:string; qty:number; price:number};
};
export type BuyerOrder = { id: string; total: number; amountDue?: number; onlinePaidAmount?: number; cashRecordedAmount?: number; cancelledAmount?: number; paymentStatus: string; paymentMethod: string; createdAt: string; address: { label: string; line1: string; locality: string; city: string; pincode: string; location?: Address["location"] }; subOrders: { id: string; shopId: string; shopName: string; status: string; deliveryState?: string; riderLocation?: {latitude:number;longitude:number;recordedAt:string}; updatedAt?: string; version?: number; fulfilment?: string; amountDue: number; deliveryFee: number; cancelReason?: string; cashCollection?: {amount:number}; refund?: {state:string;amount:number}; substitution?: OrderItemChange; lines: { productId: string; variantId?: string; variantLabel?: string; name: string; unit: string; qty: number; price: number }[] }[] };

type ListPayload<T> = T[] | { items?: T[] };
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
export class ApiError extends Error { constructor(message: string, public status: number, public code?: string, public requestId?: string) { super(message); } }
export type OrderSupportTicket = { id: string; suborderId: string; status: "open" | "in_progress" | "resolved"; note: string; version: number; kind?: string; description?: string };
export type OrderSupportMessage = { id: string; role: string; kind: string; body: string };
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

export async function request<T>(path: string, token?: string, options: RequestInit = {}, onHeaders?: (headers: Headers) => void): Promise<T> {
  if (!apiUrl) throw new Error("The marketplace connection is missing. Please install the latest app build.");
  let response: Response;
  try {
    response = await fetchWithTimeout(`${apiUrl}${path}`, { ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
  } catch (reason) { throw reason instanceof Error ? reason : new Error("Check your internet and try again."); }
  onHeaders?.(response.headers);
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { message?: string; code?: string; requestId?: string };
  if (!response.ok) {
    if (response.status === 401 && token) sessionListeners.forEach((listener) => listener(token));
    throw new ApiError(payload.message || `Marketplace request failed (${response.status}). Please try again.`, response.status, payload.code, payload.requestId ?? response.headers.get("x-request-id") ?? undefined);
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
  areas: () => getList<ServiceArea>("/areas", "delivery areas"),
  resolveArea: (latitude: number, longitude: number) => get<{ recommendedAreaId?: string }>(`/location/resolve?lat=${latitude}&lng=${longitude}`),
  categories: () => getList<Category>("/categories", "categories"),
  shopsByIds: (ids: string[]) => getList<Shop>(`/catalogue/shops/by-ids?ids=${encodeURIComponent(ids.join(","))}`, "shops"),
  product: (id: string) => get<Product>(`/products/${encodeURIComponent(id)}`),
  searchProducts: (areaId: string, text: string, cursor?: string) => searchPage<Product>("products", areaId, text, cursor),
  searchShops: (areaId: string, text: string, cursor?: string) => searchPage<Shop>("shops", areaId, text, cursor),
  async shopPage(shopId: string, cursor?: string) {
    if (!apiUrl) throw new Error("Marketplace connection is missing");
    const response = await fetchWithTimeout(`${apiUrl}/shops/${encodeURIComponent(shopId)}/products?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Shop products could not load. Please retry.");
    return { items: asList<Product>(await response.json() as ListPayload<Product>, "shop products"), cursor: response.headers.get("X-Has-More") === "true" ? response.headers.get("X-Next-Cursor") : null };
  },
  async categoryPage(areaId: string, slug: string, cursor?: string, text?: string, filters?: {sort?: "price_asc" | "price_desc" | "name"; subcategory?: string}) {
    if (!apiUrl) throw new Error("Marketplace connection is missing");
    const query = `area=${encodeURIComponent(areaId)}&category=${encodeURIComponent(slug)}&limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${text?.trim() ? `&q=${encodeURIComponent(text.trim())}` : ""}`;
    const sort = filters?.sort ? `&sort=${filters.sort}` : "";
    const subcategory = filters?.subcategory ? `&subcategory=${encodeURIComponent(filters.subcategory)}` : "";
    const response = await fetchWithTimeout(`${apiUrl}/products?${query}${sort}${subcategory}`, { headers: { Accept: "application/json" } });
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
    const query = areaId ? `?area=${encodeURIComponent(areaId)}&limit=24` : "?limit=24";
    const [categories, shops, products] = await Promise.all([
      getList<Category>("/categories", "categories"),
      areaId ? getList<Shop>(`/shops${query}`, "shops") : Promise.resolve([]),
      areaId ? getList<Product>(`/products${query}`, "products") : Promise.resolve([]),
    ]);
    return { categories, shops, products };
  },
};

export const buyerApi = {
  quoteReorder: (token: string, areaId: string, items: CheckoutLine[]) =>
    request<{itemsSubtotal: number; lines: (CheckoutLine & {product?: Product; unitPrice?: number; availableStock?: number; issues: {code: string; message: string}[]})[]; shops: CheckoutReview["shops"]}>("/cart/quote", token, {method:"POST", body:JSON.stringify({areaId,items})}),
  orderSupport: (token: string, orderId: string, after?: string) => request<{items: OrderSupportTicket[]; next?: string}>(`/support?orderId=${encodeURIComponent(orderId)}${after ? `&after=${encodeURIComponent(after)}` : ""}`, token),
  orderSupportMessages: (token: string, ticketId: string, cursor?: string) =>
    request<{items: OrderSupportMessage[]; next?: string}>(`/support/${encodeURIComponent(ticketId)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, token),
  replyToOrderSupport: (token: string, ticket: OrderSupportTicket, body: string, key: string, reopen: boolean) =>
    request<{version: number}>(`/support/${encodeURIComponent(ticket.id)}/${reopen ? "reopen" : "messages"}`, token, {method: "POST", body: JSON.stringify({version: ticket.version, body, key})}),
  createOrderSupport: (token: string, input: {orderId: string; suborderId: string; kind: string; description: string}) =>
    request<OrderSupportTicket>("/support", token, { method: "POST", body: JSON.stringify(input) }),
  notifications: (token: string) => request<{ id: string; title: string; body: string; read: boolean; createdAt?: string }[]>("/notifications?limit=20", token),
  markNotificationRead: (token: string, id: string) => request<void>(`/notifications/${encodeURIComponent(id)}/read`, token, { method: "POST", body: "{}" }),
  pushStatus: (token: string) => request<{available: boolean; subscribed: boolean}>("/notifications/push", token),
  enablePush: (token: string, deviceToken: string) => request<void>("/notifications/push", token, { method: "PUT", body: JSON.stringify({ token: deviceToken }) }),
  disablePush: (token: string) => request<void>("/notifications/push", token, { method: "DELETE" }),
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
  registerSeller: (input: { name: string; phone: string; password: string; email?: string; emailChallengeId?: string; emailOtp?: string; shop: { name: string; address: string; categoryIds: string[]; serviceAreaIds: string[]; since: number; fulfilment: string[] } }) =>
    request<Session>("/auth/register/seller", undefined, { method: "POST", body: JSON.stringify(input) }),
  sellerShop: (token: string) => request<{ name: string; coverImage?: string; status: "pending" | "approved" | "rejected" | "suspended"; review?: { reason?: string } }>("/seller/shop", token),
  me: (token: string) => request<Omit<Session, "token">>("/auth/me", token),
  logout: (token: string) => request<void>("/auth/logout", token, { method: "POST" }),
  profile: (token: string) => request<BuyerProfile>("/auth/profile", token),
  updateProfile: (token: string, name: string, version: number) => request<BuyerProfile>("/auth/profile", token, { method: "PATCH", body: JSON.stringify({ name, version }) }),
  addresses: (token: string) => request<Address[]>("/addresses", token),
  createAddress: (token: string, input: Omit<Address, "id" | "version">) => request<Address>("/addresses", token, { method: "POST", body: JSON.stringify(input) }),
  updateAddress: (token: string, id: string, input: Omit<Address, "id" | "location"> & {location?: Address["location"] | null}) => request<Address>(`/addresses/${id}`, token, { method: "PATCH", body: JSON.stringify(input) }),
  deleteAddress: (token: string, id: string, version: number) => request<void>(`/addresses/${id}`, token, { method: "DELETE", body: JSON.stringify({ version }) }),
  orders: (token: string) => request<BuyerOrder[]>("/orders?limit=30", token),
};
