import { useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { CartProvider, useCart } from "./cart";
import { config, isDemoMode } from "@/lib/config";
import { shoppingKeys, parseLines, parseWishes } from "@/lib/shopping-storage";
import { Button } from "@/components/ui/button";
export function AccountCartProvider({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  if (isDemoMode) return <CartProvider>{children}</CartProvider>;
  const owner = !ready ? "pending" : session ? `user:${session.userId}` : "guest",
    keys = shoppingKeys(config.apiUrl, owner);
  return (
    <CartProvider key={owner} storageKeys={keys} persist={ready}>
      {ready && session?.role === "buyer" && <GuestImport key={session.userId} />}
      {children}
    </CartProvider>
  );
}
function GuestImport() {
  const cart = useCart(),
    [dismissed, setDismissed] = useState<string[]>([]),
    [revision, setRevision] = useState(0);
  const guest = shoppingKeys(config.apiUrl, "guest"),
    sources = [
      { id: "guest", title: "Guest shopping", keys: guest },
      {
        id: "legacy",
        title: "Earlier browser shopping",
        keys: { cart: "jpi.api.cart", wish: "jpi.api.wish" },
      },
    ];
  void revision;
  if (!cart.ready) return null;
  return (
    <>
      {sources.map((source) => {
        let lines = 0,
          wishes = 0;
        try {
          lines = Object.keys(parseLines(localStorage.getItem(source.keys.cart))).length;
          wishes = parseWishes(localStorage.getItem(source.keys.wish)).length;
        } catch {
          return null;
        }
        if (dismissed.includes(source.id) || (!lines && !wishes)) return null;
        return (
          <section
            key={source.id}
            aria-label={`${source.title} import`}
            className="mx-4 my-3 space-y-2 rounded-xl border border-primary/20 bg-card p-4 text-sm"
          >
            <p className="font-semibold">
              {source.title}: {lines} bag lines, {wishes} saved products
            </p>
            <p>
              Import these browser items only if they are yours. Existing account quantities stay
              unchanged for matching items; prices and stock must be reviewed. This does not import
              or create orders.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (cart.importStored(source.keys.cart, source.keys.wish))
                    setRevision((v) => v + 1);
                }}
              >
                Import {source.id === "guest" ? "guest items" : "earlier browser items"}
              </Button>
              <Button variant="outline" onClick={() => setDismissed((v) => [...v, source.id])}>
                Keep separate
              </Button>
            </div>
          </section>
        );
      })}
    </>
  );
}
