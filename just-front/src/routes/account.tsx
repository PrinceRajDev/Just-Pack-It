import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { LiveAccount } from "@/components/auth/LiveAccount";
import { toast } from "sonner";
import { Plus, ShoppingBag, MapPin, Heart, UserRound, LifeBuoy } from "lucide-react";
import { StoreLayout, PageTitle } from "@/components/store/StoreLayout";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { OrdersList } from "@/components/store/OrdersList";
import { ProductCard } from "@/components/store/ProductCard";
import { EmptyState } from "@/components/common/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addresses } from "@/mocks/data";
import { productById } from "@/services/catalog";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/stores/auth";

const tabs = ["orders", "addresses", "wishlist", "profile", "support"] as const;
const tabIcons = {
  orders: ShoppingBag,
  addresses: MapPin,
  wishlist: Heart,
  profile: UserRound,
  support: LifeBuoy,
};

export const Route = createFileRoute("/account")({
  validateSearch: z.object({ tab: z.enum(tabs).optional() }),
  head: () => ({
    meta: [
      { title: "Your account: Just Pack It" },
      { name: "description", content: "Orders, addresses, wishlist and support." },
      { property: "og:title", content: "Your account: Just Pack It" },
      { property: "og:description", content: "Manage your Just Pack It account." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { tab = "orders" } = Route.useSearch();
  const navigate = useNavigate({ from: "/account" });
  const { wishlist } = useCart();
  const { session, signOut } = useAuth();
  if (!isDemoMode) return <LiveAccount tab={tab} />;

  return (
    <StoreLayout>
      <RoleGuard role="buyer">
        <PageTitle
          eyebrow="Your neighbourhood account"
          title={`Hello, ${session?.name.split(" ")[0] ?? ""}`}
        >
          <p className="mt-3 text-sm text-muted-foreground">
            Your orders, saved finds and everyday details, all in one place.
          </p>
        </PageTitle>
        <div className="account-page mx-auto max-w-5xl px-4">
          <Tabs
            className="account-workspace"
            orientation="vertical"
            value={tab}
            onValueChange={(v) => navigate({ search: { tab: v as (typeof tabs)[number] } })}
          >
            <TabsList className="account-navigation">
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t} className="account-navigation-item capitalize">
                  {(() => {
                    const Icon = tabIcons[t];
                    return <Icon className="size-4" aria-hidden />;
                  })()}
                  {t}
                  {t === "wishlist" && <span>{wishlist.length}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="orders" className="pt-6">
              <OrdersList />
            </TabsContent>
            <TabsContent value="addresses" className="account-panel pt-6">
              <div className="account-section-heading">
                <h2>Where we find you</h2>
                <p>
                  Saved addresses in the current preview. Changes require the connected address
                  service.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <li key={a.id} className="border border-border bg-card p-4">
                    <p className="font-semibold">{a.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.line1}, {a.locality}, {a.city} {a.pincode}
                    </p>
                    <div className="mt-3 flex gap-3 text-sm">
                      <button
                        className="text-primary hover:underline"
                        onClick={() => toast.info("Editing addresses needs the backend.")}
                      >
                        Edit
                      </button>
                      <button
                        className="text-destructive hover:underline"
                        onClick={() => toast.info("Removing addresses needs the backend.")}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => toast.info("Adding addresses needs the backend.")}
                    className="flex h-full min-h-28 w-full items-center justify-center gap-2 border border-dashed border-border text-sm hover:border-primary"
                  >
                    <Plus className="size-4" /> Add address
                  </button>
                </li>
              </ul>
            </TabsContent>
            <TabsContent value="wishlist" className="pt-6">
              <div className="account-section-heading">
                <h2>Your saved finds</h2>
                <p>Products you’ve kept close for another day.</p>
              </div>
              {wishlist.length === 0 ? (
                <EmptyState
                  title="Nothing saved yet"
                  body="Tap the heart on any product to save it here."
                />
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
                  {wishlist
                    .map((id) => productById(id))
                    .filter(Boolean)
                    .map((p) => (
                      <ProductCard key={p!.id} product={p!} />
                    ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="profile" className="account-panel pt-6">
              <div className="account-section-heading">
                <h2>A little about you</h2>
                <p>Account details are saved by the profile service when it is connected.</p>
              </div>
              <form
                className="max-w-md space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  toast.info("Profile updates need the backend.");
                }}
              >
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" defaultValue={session?.name} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="email">Email (for receipts)</Label>
                  <Input id="email" type="email" placeholder="you@example.com" className="mt-1" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button type="button" variant="outline" onClick={signOut}>
                    Sign out
                  </Button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="support" className="account-panel pt-6">
              <div className="account-section-heading">
                <h2>Here to help</h2>
                <p>Questions about shopping with your neighbourhood.</p>
              </div>
              <Accordion type="single" collapsible className="max-w-2xl">
                <AccordionItem value="c">
                  <AccordionTrigger>Can I cancel an order?</AccordionTrigger>
                  <AccordionContent>
                    You can cancel each shop's part for free until that shop accepts it. After that,
                    contact support.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="r">
                  <AccordionTrigger>How do refunds work?</AccordionTrigger>
                  <AccordionContent>
                    Prepaid refunds go back to the original payment method in 5 to 7 working days.
                    Cash-on-delivery orders aren't charged until delivery.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="m">
                  <AccordionTrigger>An item was missing or damaged</AccordionTrigger>
                  <AccordionContent>
                    Raise it from the order page within 24 hours. The shop and our team review every
                    report.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() =>
                  toast.info("Support tickets will be sent once the backend is connected.")
                }
              >
                Contact support
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </RoleGuard>
    </StoreLayout>
  );
}
