import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { Store, LifeBuoy, ClipboardList, CreditCard, ArrowRight, RefreshCw } from "lucide-react";
import { operationsSummary } from "@/services/operations";
import type { OperationsSummary } from "@/domain/operations";
import { Button } from "@/components/ui/button";
import { RecentAdminActivity, AdminPlatformHealth, AdminQuickActions } from "./AdminOverviewPanels";
export interface OverviewPreview {
  summary: OperationsSummary;
  shops: number;
  products: number;
  extra?: { count: number; title: string; to: string }[];
}
export function OperationsDashboard({ preview }: { preview?: OverviewPreview }) {
  const client = useQueryClient();
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
    {
      title: "Total shops",
      value: preview ? preview.shops : data?.totals?.shops,
    },
    {
      title: "Total products",
      value: preview ? preview.products : data?.totals?.products,
    },
  ];
  const cards = [
    {
      title: "Support attention",
      icon: LifeBuoy,
      count: data?.support?.count,
      to: "/admin/support",
      note: "Open and in-progress buyer issues.",
    },
    {
      title: "Shop approvals",
      icon: Store,
      count: data?.pendingShops.count,
      to: "/admin/partners",
      note: "Shops waiting for review.",
    },
    {
      title: "Orders to check",
      icon: ClipboardList,
      count: data?.staleSuborders.count,
      to: "/admin/orders",
      note: preview
        ? "Failed demo deliveries needing review."
        : data
          ? `Active shop orders unchanged for at least ${data.thresholds.orderStaleMinutes} minutes.`
          : "Active shop orders flagged for review.",
    },
    {
      title: "Payment attention",
      icon: CreditCard,
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
      <header className="admin-ledger-heading">
        <h1 id="admin-overview-heading">
          <UiText>{"Marketplace operations"}</UiText>
        </h1>
        <div className="admin-snapshot-toolbar">
          <p>
            {preview ? (
              "Demo preview · no live timestamp"
            ) : data ? (
              <>
                <UiText>{"Last updated"}</UiText>{" "}
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
                <UiText>{"· IST"}</UiText>
              </>
            ) : (
              <UiText>
                {query.isError ? "Operations data unavailable" : "Loading operations data…"}
              </UiText>
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
              <UiText>{query.isFetching ? "Refreshing…" : "Refresh data"}</UiText>
            </Button>
          )}
        </div>
      </header>
      <UiAttributes>
        <section className="admin-metrics" aria-label="Marketplace totals">
          {metrics.map(({ title, value }) => (
            <article key={title} className="admin-metric">
              <div>
                <h2>
                  <UiText>{title}</UiText>
                </h2>
                <strong>
                  <UiText>
                    {value === undefined
                      ? query.isPending && !preview
                        ? "Loading…"
                        : "Unavailable"
                      : value.toLocaleString("en-IN")}
                  </UiText>
                </strong>
              </div>
              {value !== undefined && (
                <p>
                  <UiText>{preview ? "From demo records" : "All registered records"}</UiText>
                </p>
              )}
            </article>
          ))}
          <p className="admin-reporting-note">
            <UiText>
              {"Orders today, active users, and GMV are not available in this overview."}
            </UiText>
          </p>
        </section>
      </UiAttributes>
      {!preview && query.isError && (
        <div role="alert" className="admin-overview-error">
          <p>
            Could not load operations queues.
            <UiText>{data ? " Last successful snapshot is retained." : ""}</UiText>
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry operations
          </Button>
        </div>
      )}
      <section className="admin-ledger-queue" aria-labelledby="attention-heading">
        <header>
          <h2 id="attention-heading">
            <UiText>{"Needs attention"}</UiText>
          </h2>
          <span className="tape" aria-hidden="true" />
        </header>
        <div className="admin-attention">
          {cards.map(({ title, icon: Icon, count, to, note }) => (
            <UiAttributes key={title}>
              <Link
                key={title}
                to={to}
                className="admin-attention-card"
                aria-label={`${title}: ${count ?? "Unavailable"}. Open workspace`}
              >
                <span className="admin-metric-icon">
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <h3>
                    <UiText>{title}</UiText>
                  </h3>
                  <p>{note}</p>
                </div>
                <strong className={count ? "admin-count-flagged" : undefined}>
                  <UiText>
                    {!preview && query.isPending
                      ? "Loading…"
                      : (count?.toLocaleString("en-IN") ?? "Unavailable")}
                  </UiText>
                </strong>
                <span className="admin-card-arrow">
                  <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
                </span>
              </Link>
            </UiAttributes>
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
      {!!data && (
        <details className="admin-queue-details">
          <summary>
            <UiText>{"Review flagged records"}</UiText>
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
                    <UiText>{s.title}</UiText> <span>{s.count}</span>
                  </h2>
                  <p>
                    <UiText>{s.hint}</UiText>
                  </p>
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
                      <UiText>
                        {s.count
                          ? "Open the full workspace to review flagged records."
                          : "No items currently flagged."}
                      </UiText>
                    </p>
                  )}
                  {s.count > s.rows.length && (
                    <p>
                      Showing oldest {s.rows.length} of {s.count}. Open the full workspace for more.
                    </p>
                  )}
                  <Link to={s.to} className="admin-small-link">
                    <UiText>{"Open "}</UiText>
                    {s.title.toLowerCase()} <ArrowRight size={14} />
                  </Link>
                </section>
              ))}
          </div>
          {preview?.extra?.map((i) => (
            <p key={i.title}>
              <Link to={i.to}>
                {i.count} <UiText>{i.title}</UiText> → Review
              </Link>
            </p>
          ))}
        </details>
      )}
      <div className="admin-overview-bottom">
        <RecentAdminActivity preview={!!preview} />
        <div className="admin-overview-right">
          <AdminPlatformHealth preview={!!preview} />
          <AdminQuickActions />
        </div>
      </div>
    </div>
  );
}
