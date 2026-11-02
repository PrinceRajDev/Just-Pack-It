import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { BuyAgain } from "@/components/store/BuyAgain";
import { OrderReceipt } from "@/components/store/OrderReceipt";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/store/StoreLayout";
import { OrderTimeline } from "@/components/store/OrderTimeline";
import { StatusBadge } from "@/components/common/StatusBadge";
import { fulfilmentLabel } from "@/components/store/ShopMark";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { orderQuery } from "@/services/orders";
import { shopById } from "@/services/catalog";
import { addresses } from "@/mocks/data";
import { inr } from "@/lib/image";
import { isDemoMode } from "@/lib/config";
import { CheckoutProgress } from "@/components/store/CheckoutProgress";
import { LiveOrderPage } from "@/components/store/LiveOrders";

export const Route = createFileRoute("/orders/$id")({
  validateSearch: z.object({ placed: z.boolean().optional() }),
  head: ({ params }) => ({
    meta: [
      { title: `Order ${params.id}: Just Pack It` },
      { name: "description", content: "Track each shop's part of your order." },
      { property: "og:title", content: `Order ${params.id}` },
      { property: "og:description", content: "Order tracking on Just Pack It." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const { placed } = Route.useSearch();
  const {
    data: order,
    isPending,
    isError,
    refetch,
  } = useQuery({ ...orderQuery(id), enabled: isDemoMode });
  if (!isDemoMode) return <LiveOrderPage id={id} />;

  return (
    <StoreLayout>
      <div className="order-details-page mx-auto max-w-4xl px-4 pt-10">
        {isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !order ? (
          <UiAttributes>
            <EmptyState
              title="Order not found"
              action={
                <Button asChild variant="outline">
                  <Link to="/orders">
                    <UiText>{"All orders"}</UiText>
                  </Link>
                </Button>
              }
            />
          </UiAttributes>
        ) : (
          <>
            {placed && (
              <div className="mb-8 flex gap-3 border border-success/40 bg-success/10 p-4">
                <CheckCircle2 className="size-6 shrink-0 text-success" />
                <div>
                  <p className="font-semibold">
                    <UiText>{order.isDemo ? "Demo order saved" : "Order placed"}</UiText>
                  </p>
                  <p className="text-sm">
                    <UiText>
                      {order.isDemo
                        ? "This order was saved only in your browser for preview. It has not been sent to any shop."
                        : "Each shop will confirm its part shortly."}
                    </UiText>
                  </p>
                </div>
              </div>
            )}
            <p className="label-stamp text-muted-foreground">
              <Link to="/orders" className="hover:underline">
                <UiText>{"Orders"}</UiText>
              </Link>{" "}
              / {order.id}
            </p>
            <h1 className="mt-2 font-display text-4xl">
              <UiText>{"Order "}</UiText>
              {order.id}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(order.createdAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · {addresses.find((a) => a.id === order.addressId)?.label} ·{" "}
              <UiText>
                {order.paymentMethod === "cod"
                  ? "Pay on delivery"
                  : order.paymentMethod.toUpperCase()}
              </UiText>
            </p>
            {placed && (
              <div className="mt-5 max-w-xl">
                <CheckoutProgress current="confirmation" />
              </div>
            )}
            <div className="mt-5">
              <BuyAgain order={order} />
            </div>
            <div className="mt-8 space-y-6">
              {order.subOrders.map((s) => {
                const shop = shopById(s.shopId);
                const sub = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
                return (
                  <section
                    key={s.id}
                    className="order-part-card grid gap-6 border border-border bg-card p-5 md:grid-cols-2"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl">{shop?.name}</h2>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="label-stamp mt-1 text-muted-foreground">
                        {fulfilmentLabel[s.fulfilment]}
                      </p>
                      <ul className="mt-4 space-y-1 text-sm">
                        {s.lines.map((l) => (
                          <li
                            key={`${l.productId}-${l.variantId ?? "base"}`}
                            className="flex justify-between gap-3"
                          >
                            <span>
                              {l.qty} × {l.name}
                              {l.variantLabel && (
                                <span className="block text-xs text-muted-foreground">
                                  {l.variantLabel}
                                </span>
                              )}
                            </span>
                            <span className="tabular-nums">{inr(l.qty * l.price)}</span>
                          </li>
                        ))}
                        <li className="flex justify-between border-t border-dashed border-border pt-1 text-muted-foreground">
                          <span>
                            <UiText>{"Delivery"}</UiText>
                          </span>
                          <span>
                            <UiText>{s.deliveryFee ? inr(s.deliveryFee) : "Free"}</UiText>
                          </span>
                        </li>
                        <li className="flex justify-between font-semibold">
                          <span>
                            <UiText>{"Subtotal"}</UiText>
                          </span>
                          <span className="tabular-nums">{inr(sub + s.deliveryFee)}</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <UiAttributes>
                        <OrderTimeline sub={s} />
                      </UiAttributes>
                      {!s.eta &&
                        !["delivered", "cancelled", "delivery_failed"].includes(s.status) && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Arrival time appears once a rider is assigned.
                          </p>
                        )}
                      {s.status === "placed" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="mt-4">
                              Cancel this part
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                <UiText>{"Cancel "}</UiText>
                                {shop?.name}'s part?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                The shop hasn't accepted yet, so there's no charge. Other shops in
                                this order aren't affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                <UiText>{"Keep it"}</UiText>
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  toast.info(
                                    isDemoMode
                                      ? "Cancellation needs the backend: not available in demo."
                                      : "Cancellation requested",
                                  )
                                }
                              >
                                Cancel part
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="order-total-bar mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-foreground pt-4">
              <p className="text-lg">
                <UiText>{"Total "}</UiText>
                <span className="font-semibold tabular-nums">{inr(order.total)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link to="/account" search={{ tab: "support" }}>
                    Get help
                  </Link>
                </Button>
                <OrderReceipt order={order} />
              </div>
            </div>
          </>
        )}
      </div>
    </StoreLayout>
  );
}
