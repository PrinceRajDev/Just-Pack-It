export type ServiceArea = { id: string; name: string; city: string; pincodes: string[]; active: boolean };
export type Category = { id: string; slug: string; name: string; blurb?: string; image?: string };
export type Shop = { id: string; slug: string; name: string; locality: string; tagline?: string; description?: string; isOpen: boolean; initials?: string; coverImage?: string; deliveryFee?: number; minimumOrderAmount?: number };
export type Product = { id: string; name: string; unit: string; price: number; stock: number; description?: string; image?: string; shopId: string; categorySlug?: string; tags?: string[] };

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

async function getList<T>(path: string, resource: string): Promise<T[]> {
  return asList(await get<ListPayload<T>>(path), resource);
}

export const marketApi = {
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
