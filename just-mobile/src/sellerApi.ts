import { request, type OrderItemChange, type Product, type ProductVariant } from "./api";

export type Fulfilment = "pickup" | "seller_delivery" | "platform_delivery";
export const fulfilmentNames: Record<Fulfilment, string> = { pickup: "Customer pickup", seller_delivery: "Shop delivery", platform_delivery: "Platform rider" };
export const orderStatusNames = {
  placed: "New", accepted: "Accepted", preparing: "Preparing", ready: "Ready",
  out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled",
};
export type OrderStatus = keyof typeof orderStatusNames;
export type SellerOrder = {
  id: string; orderId: string; version: number; status: OrderStatus; createdAt: string;
  fulfilment: Fulfilment; paymentMethod: "cod" | "razorpay"; paymentStatus: string; amountDue: number;
  total: number; itemsSubtotal: number; deliveryFee: number; testMode?: boolean; cancelReason?: string;
  cashCollection?: { amount: number };
  substitution?: OrderItemChange;
  refund?: { state: string; amount: number };
  delivery?: { state: string; partnerId: string };
  deliveryAddress?: { line1?: string; locality?: string; city?: string; pincode?: string };
  lines: { productId?: string; name: string; unit?: string; variantLabel?: string; qty: number; price: number }[];
};
export type SellerShop = {
  id: string; version: number; name: string; address?: string; locality?: string; tagline?: string;
  status: "pending" | "approved" | "rejected" | "suspended"; review?: { reason?: string };
  temporarilyClosed?: boolean; isOpen?: boolean; active?: boolean; fulfilment: Fulfilment[]; timezone: string;
  openingHours: { day: number; opens: string; closes: string }[];
  categoryIds: string[]; serviceAreaIds: string[]; description?: string; coverImage?: string;
  deliveryFee?: number; minimumOrderAmount?: number; pickupNote?: string;
  location?: { type: "Point"; coordinates: [number, number] };
};
export type SellerProduct = Product & { version: number; categoryId: string; subcategoryId?: string | null; active: boolean; mrp?: number | null };
export type ProductInput = Pick<SellerProduct, "name" | "unit" | "categoryId" | "price" | "stock" | "active" | "mrp" | "description"> & { image?: string | null; subcategoryId?: string | null };
export type ImageUploadCapability = { enabled: boolean; maxBytes: number; types: string[] };
export type Settlement = {
  id: string; orderId: string; grossAmount: number | null; sellerEntitlement: number | null;
  payoutAmount: number | null; sellerRetained: number | null; platformDeliveryFee: number | null;
  holdReason: string | null; posted: boolean; payout: null | { state: string; reference?: string; recordedAt?: string };
  remittance: null | { state: string };
};
export type SellerFeedback = {average:number|null;count:number;recent:{stars:number;feedback:string}[]};
type Dashboard = {
  customerFeedback?: SellerFeedback;
  todayOrders: number; pendingPayment: number; counts: Partial<Record<OrderStatus, number>>;
  lowStock: { count: number; outOfStock: number; items: { productId: string; name: string; label?: string; stock: number }[] };
};

const encode = encodeURIComponent;
const orderPath = (order: SellerOrder) => `/seller/orders/${encode(order.orderId)}/suborders/${encode(order.id)}`;
const productPath = (product?: SellerProduct) => `/seller/products${product ? "/" + encode(product.id) : ""}`;
const write = <T,>(token: string, path: string, method: string, body: unknown) =>
  request<T>(path, token, { method, body: JSON.stringify(body) });
async function page<T>(token: string, path: string, cursor?: string) {
  let next: string | undefined;
  const query = `?limit=30${cursor ? "&cursor=" + encode(cursor) : ""}`;
  const payload = await request<T[] | { items: T[]; next?: string }>(path + query, token, {}, headers => {
    next = headers.get("x-next-cursor") ?? undefined;
  });
  return Array.isArray(payload) ? { items: payload, next } : { items: payload.items, next: payload.next ?? next };
}

export const sellerApi = {
  dashboard: (token: string) => request<Dashboard>("/seller/dashboard", token),
  shop: (token: string) => request<SellerShop>("/seller/shop", token),
  saveProfile: (token: string, shop: SellerShop, input: Partial<Pick<SellerShop,"name"|"address"|"tagline"|"description"|"coverImage"|"serviceAreaIds"|"categoryIds"|"location">>) =>
    write<SellerShop>(token, "/seller/shop", "PATCH", { ...input, version: shop.version }),
  saveAvailability: (token: string, shop: SellerShop, input: Partial<Pick<SellerShop, "openingHours" | "temporarilyClosed" | "fulfilment" | "minimumOrderAmount" | "deliveryFee" | "pickupNote">>) =>
    write<SellerShop>(token, "/seller/shop/availability", "PATCH", { ...input, version: shop.version }),
  orders: (token: string, cursor?: string) => page<SellerOrder>(token, "/seller/orders", cursor),
  order: (token: string, orderId: string, subId: string) => request<SellerOrder>(`/seller/orders/${encode(orderId)}/suborders/${encode(subId)}`, token),
  proposeItemChange: (token: string, order: SellerOrder, line:number, replacementId?:string) =>
    write<void>(token, orderPath(order) + "/substitution", "POST", {version:order.version,line,replacementId}),
  move: (token: string, order: SellerOrder, status: OrderStatus, reason?: string) =>
    write<SellerOrder>(token, orderPath(order), "PATCH", { version: order.version, status, ...(reason ? { reason } : {}) }),
  handoff: (token: string, order: SellerOrder) =>
    write<unknown>(token, orderPath(order) + "/pickup", "POST", { version: order.version, partnerId: order.delivery?.partnerId, confirmHandoff: true }),
  returnGoods: (token: string, order: SellerOrder, reason: string, restock: boolean) =>
    write<unknown>(token, orderPath(order) + "/returned", "POST", { version: order.version, partnerId: order.delivery?.partnerId, confirmGoodsReceived: true, restock, reason }),
  complete: (token: string, order: SellerOrder, code: string) => {
    const prepaid = order.paymentMethod === "razorpay";
    return write<SellerOrder>(token, orderPath(order) + (prepaid ? "/complete-handoff" : "/complete-cash"), "POST", {
      version: order.version, code, ...(prepaid ? { confirmHandoff: true } : { confirmCashReceived: true, amountReceived: order.amountDue }),
    });
  },
  products: (token: string, cursor?: string) => page<SellerProduct>(token, "/seller/products", cursor),
  product: (token: string, id: string) => request<SellerProduct>("/seller/products/" + encode(id), token),
  photoCapability: (token: string) => request<ImageUploadCapability>("/seller/image-upload", token),
  uploadShopCover: (token: string, shop: SellerShop, body: ArrayBuffer, mimeType: string) =>
    request<Pick<SellerShop,"coverImage"|"status"|"version">>("/seller/shop/image", token, {
      method:"POST", body, headers:{"Content-Type":mimeType,"X-Shop-Version":String(shop.version)},
    }),
  uploadProductPhoto: (token: string, product: SellerProduct, body: ArrayBuffer, mimeType: string) =>
    request<SellerProduct>(productPath(product) + "/image", token, {
      method: "POST", body, headers: {"Content-Type":mimeType,"X-Product-Version":String(product.version)},
    }),
  saveProduct: (token: string, input: ProductInput, product?: SellerProduct) =>
    write<SellerProduct>(token, productPath(product), product ? "PATCH" : "POST", { ...input, ...(product ? { version: product.version } : {}) }),
  inventory: (token: string, product: SellerProduct, stock: number) =>
    write<SellerProduct>(token, productPath(product) + "/inventory", "PATCH", { stock, version: product.version }),
  variant: (token: string, product: SellerProduct, input: Omit<ProductVariant, "id">, id?: string) =>
    write<ProductVariant>(token, productPath(product) + "/variants" + (id ? "/" + encode(id) : ""), id ? "PATCH" : "POST", { ...input, version: product.version }),
  variantStock: (token: string, product: SellerProduct, id: string, stock: number) =>
    write<ProductVariant & {version: number}>(token, productPath(product) + "/variants/" + encode(id), "PATCH", {stock, version:product.version}),
  settlements: (token: string, cursor?: string) => page<Settlement>(token, "/settlements", cursor),
};
