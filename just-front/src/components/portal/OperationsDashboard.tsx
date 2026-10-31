import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import {
  Store,
  ShoppingBag,
  ShoppingCart,
  Users,
  IndianRupee,
  LifeBuoy,
  ClipboardList,
  CreditCard,
  ArrowRight,
  RefreshCw,
  CalendarDays,
  Leaf,
} from "lucide-react";
import { operationsSummary } from "@/services/operations";
import type { OperationsSummary } from "@/domain/operations";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { RecentAdminActivity, AdminPlatformHealth, AdminQuickActions } from "./AdminOverviewPanels";
export interface OverviewPreview {
  summary: OperationsSummary;
  shops: number;
  products: number;
  extra?: { count: number; title: string; to: string }[];
}
export function OperationsDashboard({ preview }: { preview?: OverviewPreview }) {
  const { session } = useAuth(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-operations"],
    queryFn: operationsSummary,
    enabled: !preview,
    retry: false,
    refetchInterval: 60000,
  });
  const fetching = useIsFetching({ queryKey: ["admin-overview"] }),
    data = preview?.summary ?? query.data;
  const metrics = [
    { title: "Total shops", icon: Store, tone: "green", value: preview?.shops },
    { title: "Total products", icon: ShoppingBag, tone: "yellow", value: preview?.products },
    { title: "Orders today", icon: ShoppingCart, tone: "orange" },
    { title: "Active users", icon: Users, tone: "blue" },
    { title: "GMV today", icon: IndianRupee, tone: "purple" },
  ];
  const cards = [
    {
      title: "Support attention",
      icon: LifeBuoy,
      tone: "coral",
      count: data?.support?.count,
      to: "/admin/support",
      note: "Open and in-progress buyer issues.",
    },
    {
      title: "Shop approvals",
      icon: Store,
      tone: "yellow",
      count: data?.pendingShops.count,
      to: "/admin/partners",
      note: "Shops waiting for review.",
    },
    {
      title: "Orders to check",
      icon: ClipboardList,
      tone: "green",
      count: data?.staleSuborders.count,
      to: "/admin/orders",
      note: preview
        ? "Failed demo deliveries needing review."
        : `Unchanged for ${data?.thresholds.orderStaleMinutes ?? "—"} minutes; attention, not a breach.`,
    },
    {
      title: "Payment attention",
      icon: CreditCard,
      tone: "blue",
      count: preview ? undefined : data?.payments.count,
      to: "/admin/finance",
      note: preview
        ? "Payment and refund reporting unavailable in demo."
        : data
          ? `${data.refunds.count} refund records also need review.`
          : "Payment and refund records to review.",
    },
  ];
  const sections = data
    ? [
        ...(data.support
          ? [
              {
                title: "Support attention",
                count: data.support.count,
                to: "/admin/support",
                hint: "Open and in-progress buyer issues. Resolving support does not issue a refund.",
                rows: data.support.items.map((i) => ({
                  key: i.id,
                  text: `${i.shopName} · ${i.status.replaceAll("_", " ")} · Order ${i.orderId}`,
                })),
              },
            ]
          : []),
        {
          title: "Shop approvals",
          count: data.pendingShops.count,
          to: "/admin/partners",
          hint: "Review shop details and map pins before approval.",
          rows: data.pendingShops.items.map((i) => ({ key: i.id, text: i.name })),
        },
        {
          title: "Orders to check",
          count: data.staleSuborders.count,
          to: "/admin/orders",
          hint: preview
            ? "Failed demo deliveries needing review."
            : `Active shop orders unchanged for at least ${data.thresholds.orderStaleMinutes} minutes. An attention flag, not a delivery SLA breach.`,
          rows: data.staleSuborders.items.map((i) => ({
            key: i.suborderId,
            text: `${i.shopName} · ${i.status.replaceAll("_", " ")} · Order ${i.orderId}`,
          })),
        },
        {
          title: "Payment attention",
          count: data.payments.count,
          to: "/admin/finance",
          hint: `Uncertain/review-needed records or pending for at least ${data.thresholds.paymentPendingMinutes} minutes. Do not assume capture.`,
          rows: data.payments.items.map((i) => ({
            key: i.orderId,
            text: `${i.state} · Order ${i.orderId}`,
          })),
        },
        {
          title: "Refund attention",
          count: data.refunds.count,
          to: "/admin/finance",
          hint: `Requested, failed or uncertain refunds; pending submissions older than ${data.thresholds.refundPendingHours} hours. Not bank-credit confirmation.`,
          rows: data.refunds.items.map((i) => ({
            key: i.id,
            text: `${i.testMode ? "Test · " : ""}${i.shopName} · ${i.state} · Order ${i.orderId}`,
          })),
        },
      ]
    : [];
  return (
    <div className="admin-overview">
      <section className="admin-welcome" aria-labelledby="admin-overview-heading">
        <div>
          <p className="admin-eyebrow">Welcome back{session?.name ? `, ${session.name}` : ""}</p>
          <h1 id="admin-overview-heading">Marketplace operations</h1>
          <p>
            Here's what's happening across Just Pack It. Keep an eye on approvals, orders, support
            and more.
          </p>
        </div>
        <div className="admin-welcome-note">
          <NeighbourhoodIllustration />
          <div>
            <h2>
              Local shops.
              <br />
              Stronger communities. <Leaf size={21} aria-hidden="true" />
            </h2>
            <p>You keep the marketplace running for real people, every day.</p>
          </div>
        </div>
      </section>
      <div className="admin-snapshot-toolbar">
        <span className="admin-snapshot-label">
          <CalendarDays size={18} aria-hidden="true" />
          {preview ? "Demo snapshot" : "Current snapshot"}
        </span>
        <p>
          {preview ? (
            "Demo preview · no live timestamp"
          ) : data ? (
            <>
              Last updated{" "}
              <time dateTime={data.asOf}>
                {new Date(data.asOf).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>{" "}
              · IST
            </>
          ) : (
            "Waiting for operations data"
          )}
        </p>
        {!preview && (
          <Button
            variant="outline"
            disabled={query.isFetching || fetching > 0}
            onClick={() =>
              void Promise.allSettled([
                query.refetch(),
                client.invalidateQueries({ queryKey: ["admin-overview"] }),
              ])
            }
          >
            <RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} />
            {query.isFetching ? "Refreshing…" : "Refresh data"}
          </Button>
        )}
      </div>
      <section className="admin-metrics" aria-label="Marketplace performance">
        {metrics.map(({ title, icon: Icon, tone, value }) => (
          <article key={title} className={`admin-metric tone-${tone}`}>
            <span className="admin-metric-icon">
              <Icon size={23} aria-hidden="true" />
            </span>
            <div>
              <h2>{title}</h2>
              <strong>{value === undefined ? "—" : value.toLocaleString("en-IN")}</strong>
            </div>
            <p>{value === undefined ? "Reporting unavailable" : "From demo records"}</p>
          </article>
        ))}
      </section>
      <p className="admin-reporting-note">
        {preview ? "Demo values only." : "Period totals and comparisons are not available yet."} No
        estimated trends or revenue are shown.
      </p>
      {!preview && query.isError && (
        <div role="alert" className="admin-overview-error">
          <p>
            Could not load operations queues.{data ? " Last successful snapshot is retained." : ""}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry operations
          </Button>
        </div>
      )}
      <section aria-labelledby="attention-heading">
        <h2 className="sr-only" id="attention-heading">
          What needs attention
        </h2>
        <div className="admin-attention">
          {cards.map(({ title, icon: Icon, tone, count, to, note }) => (
            <Link
              key={title}
              to={to}
              className={`admin-attention-card tone-${tone}`}
              aria-label={`${title}: ${count ?? "Unavailable"}. Open workspace`}
            >
              <span className="admin-metric-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <strong className={!preview && query.isPending ? "admin-loading-value" : ""}>
                  {!preview && query.isPending ? "…" : (count ?? "—")}
                </strong>
                <p>
                  {count === undefined && data ? "Count unavailable. " : ""}
                  {note}
                </p>
              </div>
              <span className="admin-card-arrow">
                <ArrowRight size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      {!preview && query.isPending && (
        <p role="status" className="sr-only">
          Loading marketplace attention queues…
        </p>
      )}
      {data && !data.support && (
        <p role="status" className="admin-reporting-note">
          Support queue counts are unavailable from this backend.{" "}
          <Link to="/admin/support">Open order support</Link> to review tickets.
        </p>
      )}
      <div className="admin-overview-bottom">
        <RecentAdminActivity preview={!!preview} />
        <div className="admin-overview-right">
          <AdminPlatformHealth preview={!!preview} />
          <AdminQuickActions />
        </div>
      </div>
      {!!data && (
        <details className="admin-queue-details">
          <summary>
            Review flagged records <span>Existing attention queues & thresholds</span>
          </summary>
          <div className="admin-queue-grid">
            {sections
              .filter(
                (s) =>
                  !preview || (s.title !== "Payment attention" && s.title !== "Refund attention"),
              )
              .map((s) => (
                <section key={s.title}>
                  <h2>
                    {s.title} <span>{s.count}</span>
                  </h2>
                  <p>{s.hint}</p>
                  {s.rows.length ? (
                    <ul>
                      {s.rows.map((r) => (
                        <li key={r.key}>
                          <Link to={s.to}>{r.text} → Review</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {s.count
                        ? "Open the full workspace to review flagged records."
                        : "No items currently flagged."}
                    </p>
                  )}
                  {s.count > s.rows.length && (
                    <p>
                      Showing oldest {s.rows.length} of {s.count}. Open the full workspace for more.
                    </p>
                  )}
                  <Link to={s.to} className="admin-small-link">
                    Open {s.title.toLowerCase()} <ArrowRight size={14} />
                  </Link>
                </section>
              ))}
          </div>
          {preview?.extra?.map((i) => (
            <p key={i.title}>
              <Link to={i.to}>
                {i.count} {i.title} → Review
              </Link>
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
