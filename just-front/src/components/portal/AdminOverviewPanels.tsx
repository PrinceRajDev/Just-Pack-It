import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Database,
  HeartPulse,
  CreditCard,
  Truck,
  History,
  ArrowUpRight,
  Package,
  Store,
  ClipboardList,
  LifeBuoy,
  Zap,
  MapPinned,
  ScrollText,
} from "lucide-react";
import { adminWorkspace } from "@/services/admin-workspace";
import { overviewHealth } from "@/services/overview-health";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
const groups = ["All", "Shop approvals", "Orders", "Support", "Payments", "Catalogue"] as const;
type Group = (typeof groups)[number];
function activityGroup(action: string): Group {
  if (/^(shop|seller)\./.test(action)) return "Shop approvals";
  if (/^(order|delivery)\./.test(action)) return "Orders";
  if (/^support\./.test(action)) return "Support";
  if (/^(payment|refund|cash|payout|settlement|recovery)\./.test(action)) return "Payments";
  if (/^(product|taxonomy|category)\./.test(action)) return "Catalogue";
  return "All";
}
export function RecentAdminActivity({ preview = false }: { preview?: boolean }) {
  const [group, setGroup] = useState<Group>("All");
  const query = useQuery({
    queryKey: ["admin-overview", "activity"],
    queryFn: () => adminWorkspace.audit({}),
    enabled: !preview,
    retry: false,
    refetchInterval: 60000,
  });
  const rows = (query.data?.items ?? []).filter(
    (row) => group === "All" || activityGroup(row.action) === group,
  );
  return (
    <section className="admin-panel admin-activity" aria-labelledby="admin-activity-heading">
      <div className="admin-panel-heading">
        <h2 id="admin-activity-heading">
          <History aria-hidden="true" />
          Recent activity
        </h2>
        <Link to="/admin/settings" hash="admin-audit-log" className="admin-small-link">
          View audit log <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <Tabs value={group} onValueChange={(v) => setGroup(v as Group)}>
        <TabsList aria-label="Activity type">
          {groups.map((g) => (
            <TabsTrigger key={g} value={g}>
              {g}
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((g) => (
          <TabsContent key={g} value={g}>
            {!preview && query.isPending ? (
              <div role="status" className="admin-panel-empty">
                Loading recorded actions…
              </div>
            ) : !preview && query.isError ? (
              <div role="alert" className="admin-panel-empty">
                <p>Activity could not be loaded.</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Retry activity
                </Button>
              </div>
            ) : rows.length ? (
              <ul className="admin-activity-list">
                {rows.slice(0, 5).map((row) => {
                  const kind = activityGroup(row.action),
                    Icon =
                      kind === "Catalogue"
                        ? Package
                        : kind === "Shop approvals"
                          ? Store
                          : kind === "Support"
                            ? LifeBuoy
                            : kind === "Payments"
                              ? CreditCard
                              : ClipboardList;
                  return (
                    <li key={row.id}>
                      <span
                        className={`admin-activity-icon ${kind === "Payments" ? "tone-blue" : kind === "Catalogue" ? "tone-yellow" : "tone-green"}`}
                      >
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <div className="admin-activity-copy">
                        <strong>{row.action.replaceAll(/[._]/g, " ")}</strong>
                        <span title={row.targetId}>Reference {row.targetId}</span>
                      </div>
                      <time dateTime={row.createdAt}>
                        {new Date(row.createdAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      <span className="admin-recorded-badge">Recorded</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="admin-panel-empty">
                <History size={25} aria-hidden="true" />
                <p>
                  {preview
                    ? "No recorded activity in this demo."
                    : `No ${g === "All" ? "recorded" : g.toLowerCase()} actions in the latest audit page.`}
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      <p className="admin-panel-footnote">
        {preview
          ? "Demo preview · no live activity."
          : `Latest ${query.data?.items.length ?? 0} audit records; up to 5 shown per tab. ${query.data?.next ? "More records in the audit log. " : ""}This log does not cover every marketplace event.`}
      </p>
    </section>
  );
}
export function AdminPlatformHealth({ preview = false }: { preview?: boolean }) {
  const api = useQuery({
    queryKey: ["admin-overview", "api-health"],
    queryFn: overviewHealth.api,
    enabled: !preview,
    retry: false,
    refetchInterval: 60000,
  });
  const db = useQuery({
    queryKey: ["admin-overview", "database-health"],
    queryFn: overviewHealth.database,
    enabled: !preview,
    retry: false,
    refetchInterval: 60000,
  });
  const apiOk = !preview && !api.isError && api.data?.status === "ok",
    dbOk = !preview && !db.isError && db.data?.status === "ready";
  const rows = [
    {
      name: "Database",
      icon: Database,
      label: dbOk ? "Connected" : !preview && db.isPending ? "Checking…" : "Status unavailable",
      ok: dbOk,
    },
    {
      name: "API services",
      icon: Activity,
      label: apiOk ? "Responding" : !preview && api.isPending ? "Checking…" : "Status unavailable",
      ok: apiOk,
    },
    { name: "Payment gateway", icon: CreditCard, label: "Not checked", ok: false },
    { name: "Delivery services", icon: Truck, label: "Not checked", ok: false },
  ];
  return (
    <section className="admin-panel admin-health" aria-labelledby="admin-health-heading">
      <div className="admin-panel-heading">
        <h2 id="admin-health-heading">
          <HeartPulse aria-hidden="true" />
          Platform health
        </h2>
        <span className="admin-health-overall">
          {api.isError || db.isError ? "Check unavailable" : "Checks incomplete"}
        </span>
      </div>
      <ul>
        {rows.map(({ name, icon: Icon, label, ok }) => (
          <li key={name}>
            <Icon size={18} aria-hidden="true" />
            <span>{name}</span>
            <small>
              <i className={ok ? "is-healthy" : ""} />
              {label}
            </small>
          </li>
        ))}
      </ul>
      <p className="admin-panel-footnote">
        {preview
          ? "Health is not checked in demo mode."
          : "Database connection and API response only. Payment and delivery providers have no health probe here."}
      </p>
      {!preview && (api.isError || db.isError) && (
        <Button
          variant="outline"
          onClick={() => void Promise.allSettled([api.refetch(), db.refetch()])}
        >
          Retry health checks
        </Button>
      )}
    </section>
  );
}
export function AdminQuickActions() {
  const actions = [
    { to: "/admin/partners", title: "Review shop approvals", icon: Store },
    { to: "/admin/support", title: "Check open tickets", icon: LifeBuoy },
    { to: "/admin/orders", title: "View recent orders", icon: ClipboardList },
    { to: "/admin/catalog", title: "Manage categories", icon: Package },
    { to: "/admin/settings", title: "Service areas", icon: MapPinned },
    { to: "/admin/settings", hash: "admin-audit-log", title: "View audit log", icon: ScrollText },
  ];
  return (
    <section className="admin-panel admin-quick-actions" aria-labelledby="admin-actions-heading">
      <h2 id="admin-actions-heading">
        <Zap size={19} aria-hidden="true" />
        Quick actions
      </h2>
      <ul>
        {actions.map((a) => (
          <li key={a.title}>
            <Link to={a.to} hash={a.hash}>
              <a.icon size={17} aria-hidden="true" />
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
