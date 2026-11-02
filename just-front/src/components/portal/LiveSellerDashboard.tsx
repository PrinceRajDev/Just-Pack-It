import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ManagedShop } from "@/domain/management";
import { sellerDashboard } from "@/services/seller-dashboard";
import { Kpi } from "./PortalShell";
import { SellerOrderCard } from "./LiveSellerOrders";
import { ShopReviewNotice } from "./ShopReviewNotice";
import { Button } from "@/components/ui/button";
import { ShopAvailability } from "./ShopAvailability";
import {
  Plus,
  ShoppingCart,
  Hourglass,
  Package,
  Boxes,
  ClipboardList,
  Truck,
  Settings2,
} from "lucide-react";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { OpenState } from "@/components/store/ShopMark";
export function LiveSellerDashboard({ shop }: { shop: ManagedShop }) {
  const [notice, setNotice] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false);
  const controls = useRef<HTMLDetailsElement>(null);
  const waiting = useRef<HTMLElement>(null);
  const handoffs = useRef<HTMLElement>(null);
  const stock = useRef<HTMLElement>(null);
  function jump(target: HTMLElement | null) {
    target?.scrollIntoView?.({ block: "start", behavior: "auto" });
    target?.focus({ preventScroll: true });
  }
  function openControls() {
    setControlsOpen(true);
    requestAnimationFrame(() => jump(controls.current?.querySelector("summary") ?? null));
  }
  const query = useQuery({
    queryKey: ["seller-dashboard", shop.id],
    queryFn: sellerDashboard,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const data = query.data;
  return (
    <>
      <header className="seller-today-hero">
        <div className="seller-hero-copy">
          <p className="workspace-eyebrow">Just Pack It · Workspace</p>
          <h1>
            {shop.name} · <UiText>Today</UiText>
          </h1>
          <p className="seller-hero-date">
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "full",
              timeZone: shop.timezone,
            }).format(new Date())}
          </p>
          <OpenState shop={shop} />
          <p className="seller-hero-hours">{shop.hours}</p>
        </div>
        <NeighbourhoodIllustration className="seller-hero-art" />
        <Button asChild variant="citrus" className="seller-add-product">
          <Link to="/seller/products/new">
            <Plus size={19} aria-hidden="true" />
            <UiText>{"Add product"}</UiText>
          </Link>
        </Button>
      </header>
      <ShopReviewNotice shop={shop} />
      <UiAttributes>
        <nav className="seller-quick-actions" aria-label="Daily shop tasks">
          <Button asChild>
            <Link to="/seller/orders">
              <ClipboardList aria-hidden="true" size={18} />
              <UiText>{"Manage orders"}</UiText>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/seller/inventory">
              <Boxes aria-hidden="true" size={18} />
              <UiText>{"Update stock"}</UiText>
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={openControls}
            aria-expanded={controlsOpen}
            aria-controls="seller-shop-controls"
          >
            <Settings2 aria-hidden="true" size={18} />
            <UiText>Shop controls</UiText>
          </Button>
        </nav>
      </UiAttributes>
      <div className="seller-today-grid">
        <details
          id="seller-shop-controls"
          ref={controls}
          open={controlsOpen}
          onToggle={(event) => setControlsOpen(event.currentTarget.open)}
          className="seller-controls-column seller-availability-disclosure"
        >
          <summary>
            <UiText>{"Shop hours and delivery settings"}</UiText>
            <span>
              <UiText>{"Pause orders, change fees or update opening hours"}</UiText>
            </span>
          </summary>
          <ShopAvailability shop={shop} />
        </details>
        <div className="seller-activity-column">
          {!shop.active && (
            <p role="status">
              Your shop is inactive. Contact admin; order processing is restricted.
            </p>
          )}
          {!shop.isOpen && (
            <p className="mb-4 text-sm">
              Your shop is closed for new checkout. Existing orders still need attention.{" "}
              <Link to="/seller/settings" className="underline">
                <UiText>{"Check hours and profile"}</UiText>
              </Link>
            </p>
          )}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <UiText>{"Refresh dashboard"}</UiText>
            </Button>
            {data && (
              <p className="text-sm text-muted-foreground">
                Checked{" "}
                {new Date(data.checkedAt).toLocaleString("en-IN", { timeZone: data.timezone })} ·{" "}
                {data.timezone}. Updates every 15 seconds while active.
              </p>
            )}
          </div>
          {query.isPending && <p role="status">Loading daily orders and stock…</p>}
          {query.isError && (
            <p role="alert">
              Could not refresh the dashboard.{" "}
              <UiText>
                {data
                  ? "Showing last loaded figures; refresh before acting on changed orders."
                  : "Retry with Refresh dashboard. No zero counts are assumed."}
              </UiText>
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {data && (
            <>
              <div className="seller-today-metrics">
                <UiAttributes>
                  <Kpi
                    icon={ShoppingCart}
                    label="Orders received today"
                    value={data.todayOrders}
                    hint={`${data.date} · shop orders`}
                  />
                </UiAttributes>
                <a
                  className="seller-metric-action"
                  href="#seller-waiting-orders"
                  onClick={(event) => {
                    event.preventDefault();
                    jump(waiting.current);
                  }}
                >
                  <UiAttributes>
                    <Kpi
                      icon={Hourglass}
                      label="Awaiting acceptance"
                      value={data.counts.placed ?? 0}
                      hint="All dates"
                      tone={data.counts.placed ? "warn" : undefined}
                    />
                  </UiAttributes>
                </a>
                <UiAttributes>
                  <Kpi
                    icon={Package}
                    label="Preparing / accepted"
                    value={(data.counts.accepted ?? 0) + (data.counts.preparing ?? 0)}
                    hint="All dates"
                  />
                </UiAttributes>
                <a
                  className="seller-metric-action"
                  href="#seller-restock"
                  onClick={(event) => {
                    event.preventDefault();
                    jump(stock.current);
                  }}
                >
                  <UiAttributes>
                    <Kpi
                      icon={Boxes}
                      label="Low-stock options"
                      value={data.lowStock.count}
                      hint={`${data.lowStock.outOfStock} out of stock`}
                      tone={data.lowStock.count ? "warn" : undefined}
                    />
                  </UiAttributes>
                </a>
              </div>
              <details className="my-4 text-sm text-muted-foreground">
                <summary className="cursor-pointer">
                  <UiText>{"About these counts"}</UiText>
                </summary>
                <p>
                  Daily count excludes test orders and online orders awaiting payment;
                  later-cancelled orders remain counted. These figures are not earnings or payout
                  totals.
                </p>
              </details>
              {data.pendingPayment > 0 && (
                <p className="mb-5 rounded-lg border border-border p-3 text-sm">
                  {data.pendingPayment} online shop order(s) awaiting payment across all dates. Do
                  not prepare these until payment is confirmed.{" "}
                  <Link to="/seller/orders" className="underline">
                    Review orders
                  </Link>
                </p>
              )}
              <UiAttributes>
                <section
                  id="seller-waiting-orders"
                  ref={waiting}
                  tabIndex={-1}
                  className="seller-counter-card seller-work-section"
                  aria-label="Urgent orders"
                >
                  <h2>
                    <ClipboardList aria-hidden="true" />
                    <UiText>{"Waiting at your counter"}</UiText>
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {data.counts.placed ?? 0} orders need your response. Oldest orders appear first.
                  </p>
                  {!data.urgent.length && (
                    <p>
                      <UiText>{"No orders awaiting acceptance."}</UiText>
                    </p>
                  )}
                  {data.urgent.map((sub) => (
                    <UiAttributes key={`${sub.id}:${sub.version}`}>
                      <SellerOrderCard
                        key={`${sub.id}:${sub.version}`}
                        sub={sub}
                        canProcess={shop.active && shop.status === "approved"}
                        onSaved={(status) => setNotice(`Order updated: ${status}.`)}
                      />
                    </UiAttributes>
                  ))}
                  <Button asChild variant="outline">
                    <Link to="/seller/orders">
                      <UiText>{"All orders and handoffs"}</UiText>
                    </Link>
                  </Button>
                </section>
              </UiAttributes>
              <div className="seller-secondary-grid">
                <UiAttributes>
                  <section
                    id="seller-handoffs"
                    ref={handoffs}
                    tabIndex={-1}
                    className="seller-counter-card seller-work-section"
                    aria-label="Order pipeline"
                  >
                    <h2>
                      <Truck aria-hidden="true" />
                      <UiText>{"Ready and on the way"}</UiText>
                    </h2>
                    <p className="mt-3">
                      Ready: {data.counts.ready ?? 0} · Out for delivery:{" "}
                      {data.counts.out_for_delivery ?? 0}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Open orders to confirm handoff, receipt and cash collection.
                    </p>
                    <Button asChild className="mt-4" variant="outline">
                      <Link to="/seller/orders">
                        <UiText>{"Manage handoffs"}</UiText>
                      </Link>
                    </Button>
                  </section>
                </UiAttributes>
                <UiAttributes>
                  <section
                    id="seller-restock"
                    ref={stock}
                    tabIndex={-1}
                    className="seller-counter-card seller-work-section"
                    aria-label="Low stock"
                  >
                    <h2>
                      <Boxes aria-hidden="true" />
                      <UiText>{"Restock next"}</UiText>
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Active listings and individual options with {data.lowStock.threshold} or fewer
                      units. Showing {data.lowStock.items.length} of {data.lowStock.count}.
                    </p>
                    <ul className="divide-y divide-border">
                      {data.lowStock.items.map((item) => (
                        <li
                          key={`${item.productId}:${item.variantId ?? "base"}`}
                          className="flex items-center justify-between gap-3 py-3 text-sm"
                        >
                          <span>
                            {item.name}
                            <UiText>{item.label ? ` · ${item.label}` : ""}</UiText>
                            <span className="block text-muted-foreground">
                              <UiText>
                                {item.stock === 0 ? "Out of stock" : `${item.stock} remaining`}
                              </UiText>
                            </span>
                          </span>
                          <Link to="/seller/inventory" className="shrink-0 underline">
                            <UiText>{"Edit stock"}</UiText>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {!data.lowStock.count && (
                      <p className="mt-3">
                        <UiText>{"No active listing options below the threshold."}</UiText>
                      </p>
                    )}
                    <Button asChild variant="outline" className="mt-4">
                      <Link to="/seller/inventory">
                        <UiText>{"All inventory"}</UiText>
                      </Link>
                    </Button>
                  </section>
                </UiAttributes>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
