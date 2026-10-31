import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ShieldCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { adminUsers } from "@/services/admin-users";
import type { AdminUser, UserFilters } from "@/domain/admin-users";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ConfirmAction } from "@/components/common/ConfirmAction";
import { Skeleton } from "@/components/ui/skeleton";
import { financeDate } from "@/lib/finance-date";
import "@/styles/admin-users.css";
const roleLabel = {
  buyer: "Buyer",
  seller: "Seller",
  delivery: "Delivery partner",
  admin: "Admin",
};
export function AdminUsers() {
  const { session } = useAuth(),
    client = useQueryClient();
  const [draft, setDraft] = useState(""),
    [filters, setFilters] = useState<UserFilters>({ role: "all", state: "all" }),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]),
    [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-users", filters, pages.at(-1)],
    queryFn: () => adminUsers.list(filters, pages.at(-1)),
    retry: false,
  });
  const current = query.data?.items.find((u) => u.id === selected);
  const change = (value: Partial<UserFilters>) => {
    setFilters((f) => ({ ...f, ...value }));
    setPages([undefined]);
  };
  return (
    <div className="admin-users">
      <header className="users-hero">
        <nav aria-label="Breadcrumb">
          OPERATIONS <ChevronRight size={13} />
          <b>USERS &amp; ROLES</b>
        </nav>
        <div>
          <section>
            <h1>People behind the market.</h1>
            <p>
              Review buyer, seller and delivery accounts. Manage sign-in access while keeping
              orders, shop approvals and financial records separate.
            </p>
          </section>
          <aside>
            <ShieldCheck />
            <h2>
              Responsible access.
              <br />
              Trusted neighbourhoods.
            </h2>
            <p>Roles are read-only. Admin accounts are protected.</p>
          </aside>
        </div>
      </header>
      <form
        className="users-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: draft.trim() || undefined });
        }}
      >
        <label>
          Search accounts
          <Input
            value={draft}
            maxLength={100}
            placeholder="Name, phone or exact account ID"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <label>
          Account role
          <select
            aria-label="Account role"
            value={filters.role}
            onChange={(e) => change({ role: e.target.value as UserFilters["role"] })}
          >
            <option value="all">All roles</option>
            {Object.entries(roleLabel).map(([v, label]) => (
              <option value={v} key={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account status
          <select
            aria-label="Account status"
            value={filters.state}
            onChange={(e) => change({ state: e.target.value as UserFilters["state"] })}
          >
            <option value="all">All accounts</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <Button>Search</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft("");
            setFilters({ role: "all", state: "all" });
            setPages([undefined]);
          }}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh accounts
        </Button>
      </form>
      <section className="users-panel" aria-label="Account directory">
        {query.isPending ? (
          <div role="status" aria-label="Loading accounts">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : query.isError ? (
          <div role="alert">
            <h2>Could not load accounts</h2>
            <p>{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry accounts
            </Button>
          </div>
        ) : (
          <>
            <p className="users-result-count">
              {query.data.total} matching accounts · {query.data.items.length} on this page. Account
              access does not indicate shop approval or delivery eligibility.
            </p>
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    {["Account", "Role", "Access", "Email verification", "Actions"].map((t) => (
                      <th scope="col" key={t}>
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((u) => (
                    <tr key={u.id}>
                      <td data-label="Account">
                        <b>{u.name}</b>
                        <small>{u.phone}</small>
                      </td>
                      <td data-label="Role">{roleLabel[u.role]}</td>
                      <td data-label="Access">
                        <span className={u.active ? "users-badge" : "users-badge blocked"}>
                          {u.active ? "Active" : "Blocked"}
                        </span>
                      </td>
                      <td data-label="Email verification">
                        {u.emailVerified ? "Verified" : "Not recorded"}
                      </td>
                      <td data-label="Actions">
                        <Button variant="outline" onClick={() => setSelected(u.id)}>
                          Review account
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.data.items.length && (
              <div className="users-empty">
                <Users size={44} />
                <h2>No matching accounts</h2>
                <p>Change your filters or search another name, phone or account ID.</p>
              </div>
            )}
            <nav aria-label="Account pages">
              <Button
                variant="outline"
                disabled={query.isFetching || pages.length === 1}
                onClick={() => setPages((p) => p.slice(0, -1))}
              >
                Previous accounts
              </Button>
              <Button
                variant="outline"
                disabled={query.isFetching || !query.data.next}
                onClick={() => setPages((p) => [...p, query.data.next])}
              >
                Next accounts
              </Button>
            </nav>
          </>
        )}
      </section>
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="users-drawer">
          <SheetTitle>Account access</SheetTitle>
          <SheetDescription>
            Only sign-in access changes here. Roles and operational records are preserved.
          </SheetDescription>
          {current ? (
            <AccountAccess
              key={current.id}
              user={current}
              protectedAccount={current.id === session?.userId || current.role === "admin"}
              disabled={query.isFetching || query.isError}
              onRefresh={() => query.refetch()}
              onSaved={async () => {
                await client.invalidateQueries({ queryKey: ["admin-users"] });
                void client.invalidateQueries({ queryKey: ["admin-sellers"] });
                void client.invalidateQueries({ queryKey: ["admin-audit"] });
                setSelected(null);
              }}
            />
          ) : (
            <p className="mt-5">Account is no longer in this view. Close and refresh the list.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
function AccountAccess({
  user,
  protectedAccount,
  disabled,
  onSaved,
  onRefresh,
}: {
  user: AdminUser;
  protectedAccount: boolean;
  disabled: boolean;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [needsRefresh, setNeedsRefresh] = useState(false),
    lock = useRef(false);
  const run = async () => {
    if (lock.current || protectedAccount || disabled || needsRefresh || reason.trim().length < 10)
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await adminUsers.access(user, !user.active, reason.trim());
      toast.success(
        user.active
          ? "Account blocked; sessions revoked"
          : "Account restored; fresh sign-in required",
      );
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access change was not confirmed");
      setNeedsRefresh(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <div className="users-access">
      <h2>{user.name}</h2>
      <dl>
        <dt>Account ID</dt>
        <dd>{user.id}</dd>
        <dt>Phone</dt>
        <dd>{user.phone}</dd>
        <dt>Role</dt>
        <dd>{roleLabel[user.role]}</dd>
        <dt>Access</dt>
        <dd>{user.active ? "Active" : "Blocked"}</dd>
        <dt>Created (IST)</dt>
        <dd>{financeDate(user.createdAt)}</dd>
      </dl>
      <p>
        Blocking revokes existing sessions and prevents new sign-ins. It does not hide a shop,
        cancel orders, issue refunds or change deliveries. Review affected shop operations
        separately.
      </p>
      {protectedAccount ? (
        <p role="status">
          Admin accounts and your own account are protected. Role changes are unavailable in this
          workspace.
        </p>
      ) : (
        <>
          <label>
            Reason for access change
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              disabled={busy}
            />
          </label>
          <ConfirmAction
            title={user.active ? `Block ${user.name}?` : `Restore ${user.name}?`}
            description={`${reason.trim()} Existing orders and financial records remain unchanged. Fresh sign-in is required after restoration.`}
            confirmLabel="Confirm access change"
            onConfirm={() => void run()}
          >
            <Button disabled={busy || disabled || needsRefresh || reason.trim().length < 10}>
              {busy ? "Saving…" : user.active ? "Block account" : "Restore account"}
            </Button>
          </ConfirmAction>
        </>
      )}
      {error && (
        <p role="alert">{error} Refresh the account before retrying; your reason is kept.</p>
      )}
      <Button
        variant="outline"
        disabled={busy || disabled}
        onClick={async () => {
          const result = await onRefresh();
          if (result && typeof result === "object" && "isError" in result && result.isError) return;
          setNeedsRefresh(false);
        }}
      >
        Refresh account details
      </Button>
    </div>
  );
}
