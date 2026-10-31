import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChartNoAxesCombined,
  ShoppingBag,
  IndianRupee,
  CreditCard,
  Banknote,
  ChevronRight,
} from "lucide-react";
import { adminReports } from "@/services/admin-reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { inr } from "@/lib/image";
import { financeDate } from "@/lib/finance-date";
import "@/styles/admin-reports.css";
const initial = () => {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  return {
    from: new Date(new Date(today + "T00:00:00Z").getTime() - 29 * 86400000)
      .toISOString()
      .slice(0, 10),
    to: today,
  };
};
export function AdminReports() {
  const [range, setRange] = useState(initial),
    [draft, setDraft] = useState(range);
  const query = useQuery({
    queryKey: ["admin-reports", range],
    queryFn: () => adminReports.get(range),
    retry: false,
    staleTime: 30000,
  });
  const r = query.data,
    max = Math.max(1, ...(r?.daily.map((d) => d.count) ?? []));
  return (
    <div className="admin-reports">
      <header className="reports-hero">
        <nav aria-label="Breadcrumb">
          OPERATIONS <ChevronRight size={13} />
          <b>REPORTS &amp; ANALYTICS</b>
        </nav>
        <div>
          <section>
            <h1>Your market, by the numbers.</h1>
            <p>
              Explore real order activity and recorded collections. Test orders and test payments
              are excluded.
            </p>
          </section>
          <aside>
            <ChartNoAxesCombined />
            <h2>
              Clear numbers.
              <br />
              Better local decisions.
            </h2>
            <p>Booked value is not revenue. Cash acknowledgement is not a bank deposit.</p>
          </aside>
        </div>
      </header>
      <form
        className="reports-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ ...draft });
        }}
      >
        <label>
          From date (IST)
          <Input
            type="date"
            value={draft.from}
            required
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </label>
        <label>
          To date (IST)
          <Input
            type="date"
            value={draft.to}
            required
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </label>
        <Button disabled={query.isFetching}>Apply dates</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = initial();
            setDraft(next);
            setRange(next);
          }}
        >
          Last 30 days
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh report
        </Button>
        <p>Inclusive IST dates · up to 90 days</p>
      </form>
      {query.isPending ? (
        <div role="status" aria-label="Loading report">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError ? (
        <section className="reports-panel" role="alert">
          <h2>Could not load report</h2>
          <p>{query.error.message} Your selected dates are kept.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry report
          </Button>
        </section>
      ) : (
        r && (
          <>
            <p className="reports-check">
              {r.from} to {r.to} · {r.timezone} · Generated {financeDate(r.checkedAt)}. Live
              database reads may change during generation.
            </p>
            <section className="reports-metrics" aria-label="Report metrics">
              {[
                {
                  title: "Orders created",
                  value: String(r.orders.count),
                  icon: ShoppingBag,
                  note: "Created in range; includes unpaid/cancelled",
                },
                {
                  title: "Original booked value",
                  value: inr(r.orders.amountCents / 100),
                  icon: IndianRupee,
                  note: "Original totals; not realised revenue",
                },
                {
                  title: "Recorded online captures",
                  value: inr(r.captures.amountCents / 100),
                  icon: CreditCard,
                  note: `${r.captures.count} verified local captures by capture date`,
                },
                {
                  title: "Cash acknowledged",
                  value: inr(r.cash.amountCents / 100),
                  icon: Banknote,
                  note: `${r.cash.count} shop collections by recorded date; not remittance`,
                },
              ].map(({ title, value, icon: Icon, note }) => (
                <article key={title}>
                  <Icon aria-hidden="true" />
                  <p>{title}</p>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </article>
              ))}
            </section>
            <section className="reports-panel">
              <h2>Daily order activity</h2>
              <p>
                Orders created on each IST date. Zero days mean no matching live orders, not missing
                sample data.
              </p>
              {r.orders.count === 0 && (
                <p role="status">No live orders were created in this range.</p>
              )}
              <div
                className="reports-chart"
                role="region"
                tabIndex={0}
                aria-label="Daily order chart; scroll horizontally for more dates"
              >
                {r.daily.map((d) => (
                  <div key={d.date} className="reports-bar-column">
                    <span>{d.count}</span>
                    <div className="reports-bar-track">
                      <div style={{ height: `${(d.count / max) * 100}%` }} />
                    </div>
                    <span>{d.date.slice(5)}</span>
                    <span className="sr-only">
                      {d.date}: {d.count} orders
                    </span>
                  </div>
                ))}
              </div>
              <details>
                <summary>View daily data table</summary>
                <div className="reports-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date (IST)</th>
                        <th>Orders created</th>
                        <th>Original value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.daily.map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{d.count}</td>
                          <td>{inr(d.amountCents / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <div className="reports-two-columns">
              <section className="reports-panel">
                <h2>Shop-order status</h2>
                <p>
                  Current status of shop suborders from orders created in range. One mixed-shop
                  order can have multiple parts.
                </p>
                {!r.statuses.length ? (
                  <p>No matching shop orders.</p>
                ) : (
                  <ul className="reports-statuses">
                    {r.statuses.map((s) => (
                      <li key={s.status}>
                        <span>{s.status.replaceAll("_", " ")}</span>
                        <b>{s.count}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="reports-panel">
                <h2>Refund request cohort</h2>
                <p>
                  Live requests created in range, grouped by current state. Processed is not a
                  processed-date report or bank-credit confirmation.
                </p>
                {!r.refunds.length ? (
                  <p>No live refund requests created in this range.</p>
                ) : (
                  <div className="reports-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Current state</th>
                          <th>Requests</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.refunds.map((f) => (
                          <tr key={f.state}>
                            <td>{f.state}</td>
                            <td>{f.count}</td>
                            <td>{inr(f.amountCents / 100)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            <section className="reports-panel">
              <h2>Shops by original booked value</h2>
              <p>
                Top 10 independent shop IDs, ranked by frozen original shop charges in orders
                created in range. Includes unpaid/cancelled parts; not seller earnings or payout.
              </p>
              {!r.shops.length ? (
                <p>No matching shop activity.</p>
              ) : (
                <div className="reports-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Shop</th>
                        <th>Shop orders</th>
                        <th>Cancelled parts</th>
                        <th>Original booked value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.shops.map((s) => (
                        <tr key={s.shopId}>
                          <td>
                            <b>{s.shopName}</b>
                            <small>{s.shopId}</small>
                          </td>
                          <td>{s.count}</td>
                          <td>{s.cancelled}</td>
                          <td>{inr(s.amountCents / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="reports-check">
              Profit, bank balance, platform revenue, forecasts and seller payouts are not inferred.
              Review the finance ledger for manual payout records.
            </p>
          </>
        )
      )}
    </div>
  );
}
