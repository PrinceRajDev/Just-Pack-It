// Seller-side demo state (in-memory). Replace with TanStack Query mutations against:
// PATCH /seller/products/:id, POST /seller/products, PATCH /seller/orders/:id/status
import { createContext, useContext, useState, type ReactNode } from "react";
import { products as allProducts, sellerOrders, type SellerOrder } from "@/mocks/data";
import type { Product } from "@/domain/types";

export type SellerProduct = Product & { archived?: boolean; hidden?: boolean };

interface Ctx {
  products: SellerProduct[];
  orders: SellerOrder[];
  updateProduct: (id: string, patch: Partial<SellerProduct>) => void;
  addProduct: (p: SellerProduct) => void;
  setOrderStatus: (id: string, status: SellerOrder["status"]) => void;
}
const C = createContext<Ctx | null>(null);

export const SELLER_SHOP_ID = "s1";
export const LOW_STOCK = 10;

export function SellerProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<SellerProduct[]>(
    allProducts.filter((p) => p.shopId === SELLER_SHOP_ID),
  );
  const [orders, setOrders] = useState(sellerOrders);
  return (
    <C.Provider
      value={{
        products,
        orders,
        updateProduct: (id, patch) =>
          setProducts((ps) =>
            ps.map((p) =>
              p.id === id && p.shopId === SELLER_SHOP_ID
                ? { ...p, ...patch, id: p.id, shopId: p.shopId }
                : p,
            ),
          ),
        addProduct: (p) => setProducts((ps) => [p, ...ps]),
        setOrderStatus: (id, status) =>
          setOrders((os) => os.map((o) => (o.id === id ? { ...o, status } : o))),
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useSeller() {
  const c = useContext(C);
  if (!c) throw new Error("useSeller outside provider");
  return c;
}
