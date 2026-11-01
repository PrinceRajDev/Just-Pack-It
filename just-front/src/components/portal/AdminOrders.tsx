import { z } from "zod";
import { Input } from "@/components/ui/input";
import { useRef, useState } from "react";
import {
  ShoppingCart,
  IndianRupee,
  Banknote,
  CreditCard,
  Truck,
  ChevronRight,
  PackageOpen,
  ReceiptText,
  RefreshCw,
  Search,
} from "lucide-react";
import type { AdminOrder } from "@/domain/admin-orders";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { imageUrl } from "@/lib/image";
import "@/styles/admin-orders.css";
import { useQuery } from "@tanstack/react-query";
import { listAdminOrders, type CashFilter } from "@/services/admin-orders";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
export function AdminOrders({
  initialOrderId,
  onLookup,
}: { initialOrderId?: string; onLookup?: (id: string | undefined) => void } = {}) {
  const [draftId, setDraftId] = useState(initialOrderId ?? ""),
    [orderId, setOrderId] = useState<string | undefined>(initialOrderId),
    [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const opener = useRef<HTMLElement | null>(null),
    lookupInput = useRef<HTMLInputElement>(null);
  function view(order: AdminOrder) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(order);
  }
  const [cash, setCash] = useState<CashFilter>("all");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ["admin-orders", cash, cursor, orderId],
    queryFn: () => listAdminOrders(cash, cursor, orderId),
    retry: false,
  });
  return (
    <div className="admin-orders-page">
      <section className="orders-hero">
        <div>
          <nav aria-label="Breadcrumb">
            <a href="/admin">Operations</a>
            <ChevronRight size={13} aria-hidden="true" />
            <span>Orders & cash records</span>
          </nav>
          <h1>Orders & cash records</h1>
          <p>
            Monitor marketplace orders and view cash collection records. Order payments and cash
            settlements are tracked separately.
          </p>
        </div>
        <div className="orders-hero-visual">
          <img src={imageUrl("/admin-orders-hero-v1.webp")} alt="" width={900} height={600} />
          <div>
            <Truck size={30} aria-hidden="true" />
            <h2>
              Orders delivered.
              <br />
              Communities grow.
            </h2>
            <p>Track orders and cash records for a transparent marketplace.</p>
          </div>
        </div>
      </section>
      <section className="orders-metrics" aria-label="Order reporting">
        <article className="orders-tone-green">
          <ShoppingCart aria-hidden="true" />
          <div>
            <h2>Total orders</h2>
            <strong>N/A</strong>
            <p>Reporting unavailable</p>
          </div>
        </article>
        <article className="orders-tone-yellow">
          <IndianRupee aria-hidden="true" />
          <div>
            <h2>Total order value</h2>
            <strong>N/A</strong>
            <p>Reporting unavailable</p>
          </div>
        </article>
        <article className="orders-tone-orange">
          <Banknote aria-hidden="true" />
          <div>
            <h2>COD collections</h2>
            <strong>N/A</strong>
            <p>Reporting unavailable</p>
          </div>
        </article>
        <article className="orders-tone-blue">
          <CreditCard aria-hidden="true" />
          <div>
            <h2>Online payments</h2>
            <strong>N/A</strong>
            <p>Reporting unavailable</p>
          </div>
        </article>
      </section>
      <p className="orders-reporting-note">
        Read-only order monitoring. Cash reports and captured online payments are separate; neither
        implies seller settlement. Platform-wide totals and historical comparisons are unavailable.
      </p>
      <form
        className="orders-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draftId.trim().toLowerCase();
          if (value && !z.uuid().safeParse(value).success) {
            setSearchError("Enter the full Order ID copied from the order or support ticket.");
            return;
          }
          setSearchError("");
          setOrderId(value || undefined);
          onLookup?.(value || undefined);
          setCash("all");
          setCursors([undefined]);
        }}
      >
        <label className="w-full min-w-0 text-sm sm:flex-1" htmlFor="admin-order-id">
          Find an order by ID
          <Input
            id="admin-order-id"
            ref={lookupInput}
            className="mt-1"
            value={draftId}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the full Order ID"
            aria-invalid={!!searchError}
            aria-describedby="admin-order-id-help"
            onChange={(event) => setDraftId(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={query.isFetching}>
          <Search size={16} />
          Find order
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraftId("");
            setOrderId(undefined);
            onLookup?.(undefined);
            setSearchError("");
            setCash("all");
            setCursors([undefined]);
            lookupInput.current?.focus();
          }}
        >
          Clear lookup
        </Button>
        <p id="admin-order-id-help" className="w-full text-sm text-muted-foreground">
          Exact ID lookup searches all orders. Applying a lookup resets the cash filter.
        </p>
        {searchError && (
          <p role="alert" className="w-full text-sm text-destructive">
            {searchError}
          </p>
        )}
      </form>
      {orderId && (
        <p role="status" className="mb-3 break-all text-sm">
          Looking up order {orderId}
        </p>
      )}
      <div className="orders-cash-toolbar">
        <label>
          Cash filter{" "}
          <select
            className="ml-2 rounded border bg-background p-2"
            disabled={query.isFetching}
            value={cash}
            onChange={(event) => {
              setCash(event.target.value as CashFilter);
              setCursors([undefined]);
            }}
          >
            <option value="all">All orders</option>
            <option value="outstanding">Has outstanding COD cash</option>
            <option value="recorded">Has recorded COD cash</option>
          </select>
        </label>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
        {query.dataUpdatedAt > 0 && (
          <p>
            Last refreshed{" "}
            {new Date(query.dataUpdatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} ·
            IST
          </p>
        )}
      </div>
      {query.isPending ? (
        <p role="status">Loading orders…</p>
      ) : query.error ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Showing {query.data.orders.length} orders on this page. Filters can overlap for
            partially collected orders. Amounts below are per order, not platform-wide totals.
          </p>
          {!query.data.orders.length && (
            <section className="orders-empty">
              <div>
                <PackageOpen size={90} aria-hidden="true" />
                <ReceiptText size={43} aria-hidden="true" />
              </div>
              <h2>No matching orders</h2>
              <p>
                {orderId
                  ? "No order matches this ID and cash filter. Check the full ID or clear the lookup."
                  : "Try adjusting your cash filter or search for a different Order ID. New orders appear when customers place them."}
              </p>
              <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
                <RefreshCw size={16} />
                Refresh data
              </Button>
            </section>
          )}
          {!!query.data.orders.length && (
            <div className="orders-table-wrap">
              <table>
                <caption className="sr-only">Order records</caption>
                <thead>
                  <tr>
                    {[
                      "Order / date",
                      "Shops / status",
                      "Payment",
                      "Order value",
                      "Cash recorded",
                      "Remaining",
                      "Action",
                    ].map((t) => (
                      <th key={t} scope="col">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong className="orders-id">{order.id}</strong>
                        <small>
                          {new Date(order.createdAt).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })}{" "}
                          · IST
                        </small>
                        {order.testMode && (
                          <span className="orders-status orders-test">Test · do not fulfil</span>
                        )}
                      </td>
                      <td>
                        {order.subOrders.map((sub) => (
                          <div key={sub.id}>
                            <strong>{sub.shopName}</strong>
                            <span className={`orders-status orders-status-${sub.status}`}>
                              {sub.status.replaceAll("_", " ")}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td>
                        {order.paymentMethod === "razorpay" ? "Razorpay online" : "COD"}
                        <small>
                          {order.paymentStatus === "paid"
                            ? "Captured online"
                            : order.paymentStatus.replaceAll("_", " ")}
                        </small>
                      </td>
                      <td>{money(order.total)}</td>
                      <td>{money(order.cashRecordedAmount)}</td>
                      <td>{money(order.amountDue)}</td>
                      <td>
                        <Button variant="outline" size="sm" onClick={() => view(order)}>
                          View details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="orders-mobile-records space-y-5">
            {query.data.orders.map((order) => (
              <article key={order.id} className="rounded-xl border bg-card p-5">
                {order.testMode && (
                  <p className="font-semibold">Test order: no real payment. Do not fulfil.</p>
                )}
                <h2 className="break-all font-semibold">Order {order.id}</h2>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
                  · IST
                </p>
                <p className="text-sm">
                  {order.paymentMethod === "razorpay" ? "Razorpay online" : "COD"} ·{" "}
                  {order.paymentStatus === "paid"
                    ? "Captured online"
                    : order.paymentStatus.replaceAll("_", " ")}
                </p>
                <dl className="my-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  {[
                    ["Original total", order.total],
                    ["Cash recorded", order.cashRecordedAmount],
                    ["Remaining payment", order.amountDue],
                    ["Cancelled", order.cancelledAmount],
                  ].map(([label, amount]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="font-semibold">{money(amount as number)}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="divide-y">
                  {order.subOrders.map((sub) => (
                    <li key={sub.id} className="py-3">
                      <h3 className="font-semibold">{sub.shopName}</h3>
                      <p className="text-sm">
                        {sub.status.replaceAll("_", " ")} ·{" "}
                        {sub.fulfilment === "pickup"
                          ? "Pickup"
                          : sub.fulfilment === "platform_delivery"
                            ? "Platform delivery"
                            : "Seller delivery"}
                      </p>
                      <p className="text-sm">
                        Remaining: {money(sub.amountDue)}
                        {sub.cashCollection &&
                          ` · Cash recorded: ${money(sub.cashCollection.amount)} on ${new Date(sub.cashCollection.recordedAt).toLocaleString("en-IN")}`}
                      </p>
                      {sub.cancelReason && (
                        <p className="text-sm">Cancellation reason: {sub.cancelReason}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <Button variant="outline" onClick={() => view(order)}>
                  View details
                </Button>
              </article>
            ))}
          </div>
          <nav aria-label="Order pages" className="mt-6 flex gap-3">
            <Button
              variant="outline"
              disabled={cursors.length === 1 || query.isFetching}
              onClick={() => setCursors(cursors.slice(0, -1))}
            >
              Previous page
            </Button>
            <Button
              variant="outline"
              disabled={!query.data.next || query.isFetching}
              onClick={() => setCursors([...cursors, query.data.next])}
            >
              Next page
            </Button>
          </nav>
        </>
      )}
      {selected && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <SheetContent
            className="orders-detail-drawer w-full sm:max-w-xl"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
              else lookupInput.current?.focus();
            }}
          >
            <SheetTitle>Order details</SheetTitle>
            <SheetDescription>
              Read-only saved order snapshot. Refresh the order list for later updates.
            </SheetDescription>
            <OrderDetails order={selected} />
            <Button variant="outline" onClick={() => setSelected(null)}>
              Return to orders
            </Button>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
function OrderDetails({ order }: { order: AdminOrder }) {
  return (
    <div className="orders-detail-content">
      {order.testMode && (
        <p className="orders-test">Test order · no real payment. Do not fulfil.</p>
      )}
      <h3>Order {order.id}</h3>
      <p>{new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · IST</p>
      <p>
        {order.paymentMethod === "razorpay" ? "Razorpay online" : "COD"} ·{" "}
        {order.paymentStatus === "paid"
          ? "Captured online"
          : order.paymentStatus.replaceAll("_", " ")}
      </p>
      <dl>
        {[
          ["Original total", order.total],
          ["Cash recorded", order.cashRecordedAmount],
          ["Remaining payment", order.amountDue],
          ["Cancelled amount", order.cancelledAmount],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{money(value as number)}</dd>
          </div>
        ))}
      </dl>
      <p>
        Order value is not collected cash. Captured online payments and cash records do not
        establish remittance or seller settlement.
      </p>
      <h3>Shop-wise records</h3>
      {order.subOrders.map((sub) => (
        <section key={sub.id}>
          <h4>{sub.shopName}</h4>
          <p className="orders-id">Shop part {sub.id}</p>
          <p>
            <span className={`orders-status orders-status-${sub.status}`}>
              {sub.status.replaceAll("_", " ")}
            </span>{" "}
            · {sub.fulfilment.replaceAll("_", " ")}
          </p>
          <p>Remaining: {money(sub.amountDue)}</p>
          {sub.cashCollection && (
            <>
              <p>Cash recorded: {money(sub.cashCollection.amount)}</p>
              <p>
                Recorded{" "}
                {new Date(sub.cashCollection.recordedAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                · IST
              </p>
              <p>
                Buyer receipt confirmed{" "}
                {new Date(sub.cashCollection.buyerConfirmedAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                · IST
              </p>
            </>
          )}
          {sub.cancelReason && <p>Cancellation reason: {sub.cancelReason}</p>}
        </section>
      ))}
      <p className="orders-detail-unavailable">
        Customer identity/address, item lines, payment references, refund details and delivery
        assignment are excluded from this monitoring API. No verification code or settlement status
        is inferred.
      </p>
    </div>
  );
}
