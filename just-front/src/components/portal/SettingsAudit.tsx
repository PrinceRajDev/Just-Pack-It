import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FileText, RefreshCw } from "lucide-react";
import { adminWorkspace } from "@/services/admin-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { financeDate } from "@/lib/finance-date";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function AuditExplorer() {
  const [action, setAction] = useState(""),
    [target, setTarget] = useState(""),
    [filters, setFilters] = useState<{ action?: string; targetId?: string }>({});
  const query = useInfiniteQuery({
    queryKey: ["admin-audit", filters],
    queryFn: ({ pageParam }) => adminWorkspace.audit(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section id="admin-audit-log" className="settings-panel">
      <header className="settings-panel-heading">
        <div>
          <h2>
            <FileText />
            Audit log
          </h2>
          <p>
            Records new moderation, taxonomy reactivation and support actions from this release. No
            historical backfill or complete platform-wide audit is claimed. Conversation text and
            customer contacts are excluded.
          </p>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          Refresh records
        </Button>
      </header>
      <form
        className="settings-audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (target && !uuid.test(target)) return;
          setFilters({
            action: action.trim() || undefined,
            targetId: target.toLowerCase() || undefined,
          });
        }}
      >
        <label>
          Exact action
          <Input
            maxLength={80}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. product.block"
          />
        </label>
        <label>
          Target ID
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value.trim())}
            aria-invalid={!!target && !uuid.test(target)}
            placeholder="Exact target UUID"
          />
        </label>
        <Button disabled={!!target && !uuid.test(target)}>Filter audit</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAction("");
            setTarget("");
            setFilters({});
          }}
        >
          Clear audit filters
        </Button>
      </form>
      <p className="settings-api-note">
        Date-range filtering, target type, descriptive details and named users are not supplied by
        this audit API. Actor IDs and roles below are the recorded values.
      </p>
      {query.isError && (
        <div role="alert">
          Could not refresh this view. Previously loaded records may be outdated.{" "}
          {query.error.message}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry audit
          </Button>
        </div>
      )}
      {query.isPending ? (
        <div role="status" aria-label="Loading audit records">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <div className="settings-table">
            <table>
              <thead>
                <tr>
                  {["Date & time (IST)", "Action", "Target ID", "Actor / role", "Version"].map(
                    (h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Date & time (IST)">{financeDate(r.createdAt)}</td>
                    <td data-label="Action">{r.action}</td>
                    <td data-label="Target ID">{r.targetId}</td>
                    <td data-label="Actor / role">
                      {r.actorId}
                      <small>{r.role}</small>
                    </td>
                    <td data-label="Version">{r.version ?? "Not recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.isSuccess && !rows.length && (
            <div className="settings-empty">
              <FileText />
              <h3>No matching audit records</h3>
              <p>Try another exact action or target ID. No historical records are fabricated.</p>
            </div>
          )}
        </>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more records
        </Button>
      )}
    </section>
  );
}
