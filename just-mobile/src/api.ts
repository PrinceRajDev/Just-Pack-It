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
export type BuyerOrder = { id: string; total: number; amountDue?: number; paymentStatus: string; createdAt: string; suborders?: { id: string; shopName?: string; status: string; total?: number }[] };

type ListPayload<T> = T[] | { items?: T[] };
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

function asList<T>(payload: ListPayload<T>, resource: string): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  throw new Error(`The ${resource} response was not in the expected format.`);
}

async function get<T>(path: string): Promise<T> {
  if (!apiUrl) throw new Error("The marketplace connection is missing. Please install the latest app build.");
  let response: Response;
  try { response = await fetch(`${apiUrl}${path}`, { headers: { Accept: "application/json" } }); }
  catch { throw new Error("We could not reach Just Pack It. Check your internet and try again."); }
  if (!response.ok) throw new Error(`Marketplace request failed (${response.status}). Please try again.`);
  return response.json() as Promise<T>;
}

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error("The marketplace connection is missing. Please install the latest app build.");
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
  } catch { throw new Error("We could not reach Just Pack It. Check your internet and try again."); }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message || `Marketplace request failed (${response.status}). Please try again.`);
  return payload as T;
}

async function getList<T>(path: string, resource: string): Promise<T[]> {
  return asList(await get<ListPayload<T>>(path), resource);
}

export const marketApi = {
  shops: (areaId: string) => getList<Shop>(`/shops?area=${encodeURIComponent(areaId)}&limit=100`, "shops"),
  shopProducts: (shopId: string) => getList<Product>(`/shops/${encodeURIComponent(shopId)}/products?limit=100`, "shop products"),
  async search(areaId: string, text: string) {
    const query = `?area=${encodeURIComponent(areaId)}&q=${encodeURIComponent(text.trim())}&limit=100`;
    const [products, shops] = await Promise.all([
      getList<Product>(`/products${query}`, "products"),
      getList<Shop>(`/shops${query}`, "shops"),
    ]);
    return { products, shops };
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
  reviewCheckout: (token: string, areaId: string, address: Address, items: CheckoutLine[], shopIds: string[]) => request<CheckoutReview>("/checkout/review", token, { method: "POST", body: JSON.stringify({ areaId, addressId: address.id, addressVersion: address.version, items, fulfilments: shopIds.map((shopId) => ({ shopId, method: "platform_delivery" })) }) }),
  login: (phone: string, password: string) => request<Session>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ phone, password }) }),
  register: (name: string, phone: string, password: string) => request<Session>("/auth/register", undefined, { method: "POST", body: JSON.stringify({ name, phone, password }) }),
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
