import { SupportConversation } from "@/components/common/SupportConversation";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { support } from "@/services/support";
import type { SupportTicket } from "@/domain/support";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Headphones,
  Clock3,
  CircleCheck,
  MessageCircle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { imageUrl } from "@/lib/image";
import { financeDate } from "@/lib/finance-date";
import { toast } from "sonner";
import "@/styles/admin-support.css";
const statusText = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
export function LiveSupport() {
  const [draft, setDraft] = useState(""),
    [search, setSearch] = useState("");
  const [status, setStatus] = useState<SupportTicket["status"] | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ["admin-support", status, search],
    queryFn: ({ pageParam }) =>
      support.list(
        undefined,
        pageParam,
        status === "all" ? undefined : status,
        search || undefined,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [],
    ticket = rows.find((t) => t.id === selected);
  const cards = [
    {
      title: "Tickets in this view",
      icon: Headphones,
      value: rows.length,
      note: "Loaded matching results",
    },
    {
      title: "Open tickets",
      icon: Clock3,
      value: rows.filter((t) => t.status === "open").length,
      note: "Need attention",
    },
    {
      title: "In progress",
      icon: MessageCircle,
      value: rows.filter((t) => t.status === "in_progress").length,
      note: "Under review",
    },
    {
      title: "Resolved tickets",
      icon: CircleCheck,
      value: rows.filter((t) => t.status === "resolved").length,
      note: "Resolution recorded",
    },
  ];
  return (
    <div className="admin-support">
      <header className="support-hero">
        <div>
          <nav aria-label="Breadcrumb">
            OPERATIONS <ChevronRight size={13} />
            <b>ORDER SUPPORT</b>
          </nav>
          <h1>Order support</h1>
          <p>
            Review buyer issues by shop. Resolve customer concerns and keep marketplace operations
            running smoothly. Resolution does not issue refunds or change orders.
          </p>
        </div>
        <div className="support-hero-art">
          <img src={imageUrl("/admin-support-hero-v1.webp")} alt="" />
          <aside>
            <Headphones />
            <h2>
              Support local customers.
              <br />
              Build stronger trust.
            </h2>
            <p>Help resolve buyer issues and keep the marketplace reliable.</p>
          </aside>
        </div>
      </header>
      <section className="support-metrics" aria-label="Loaded ticket statistics">
        {cards.map(({ title, icon: Icon, value, note }) => (
          <article key={title}>
            <Icon aria-hidden="true" />
            <div>
              <p>{title}</p>
              {q.isPending ? (
                <Skeleton className="my-2 h-8 w-12" />
              ) : (
                <strong>{q.isError ? "N/A" : value}</strong>
              )}
              <small>{q.isError ? "Count unavailable" : note}</small>
            </div>
          </article>
        ))}
      </section>
      <p className="support-count-note">
        Counts cover loaded results for the current search and status, not all marketplace tickets.
        {q.hasNextPage ? " More matching tickets are available below." : ""}
      </p>
      <form
        className="support-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
        }}
      >
        <label>
          Search support tickets
          <Input
            maxLength={100}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Shop name, order ID, issue or conversation…"
          />
        </label>
        <label>
          Ticket status
          <select
            aria-label="Ticket status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">All tickets</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <Button type="submit">Search tickets</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft("");
            setSearch("");
            setStatus("all");
          }}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          <RefreshCw size={16} />
          Refresh tickets
        </Button>
      </form>
      <section className="support-results" aria-label="Support ticket results">
        {q.isPending ? (
          <div role="status" aria-label="Loading support tickets">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="my-3 h-20 w-full" />
            ))}
          </div>
        ) : q.isError ? (
          <div role="alert" className="support-error">
            <Headphones />
            <h2>Could not load tickets</h2>
            <p>{q.error.message} Your filters are kept. Refresh before updating a ticket.</p>
            <Button variant="outline" onClick={() => void q.refetch()}>
              Retry tickets
            </Button>
          </div>
        ) : (
          <>
            {!rows.length ? (
              <div className="support-empty">
                <div className="support-empty-art" aria-hidden="true">
                  <Headphones />
                  <MessageCircle />
                </div>
                <h2>
                  {search || status !== "all"
                    ? "No matching support tickets"
                    : "No support tickets"}
                </h2>
                <p>
                  {status !== "all"
                    ? `No ${status.replaceAll("_", " ")} tickets match this view. `
                    : "There are no buyer issues in this view. "}
                  {search || status !== "all"
                    ? "Try another search or clear your filters."
                    : "New tickets will appear here when buyers need support."}
                </p>
                <Button variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>
                  <RefreshCw size={16} />
                  Refresh tickets
                </Button>
              </div>
            ) : (
              <div className="support-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {["Shop / ticket", "Order", "Issue", "Created (IST)", "Status", "Action"].map(
                        (h) => (
                          <th scope="col" key={h}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td data-label="Shop / ticket">
                          <b>{t.shopName}</b>
                          <small>{t.id}</small>
                        </td>
                        <td data-label="Order">
                          <span>{t.orderId}</span>
                          <small>Part {t.suborderId}</small>
                        </td>
                        <td data-label="Issue">
                          <b>{t.kind.replaceAll("_", " ")}</b>
                          <p className="support-issue-summary">{t.description}</p>
                        </td>
                        <td data-label="Created (IST)">{financeDate(t.createdAt)}</td>
                        <td data-label="Status">
                          <span className={`support-status ${t.status}`}>
                            {statusText[t.status]}
                          </span>
                        </td>
                        <td data-label="Action">
                          <Button variant="outline" onClick={() => setSelected(t.id)}>
                            View ticket
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {q.hasNextPage && (
              <Button
                variant="outline"
                disabled={q.isFetching}
                onClick={() => void q.fetchNextPage()}
              >
                Load more tickets
              </Button>
            )}
          </>
        )}
        {q.isFetching && !q.isPending && (
          <p role="status" className="support-refreshing">
            Refreshing tickets…
          </p>
        )}
      </section>
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="support-drawer">
          <SheetTitle>Support ticket details</SheetTitle>
          <SheetDescription>
            Buyer-visible conversation and resolution. Support actions never change payment, refund
            or fulfilment.
          </SheetDescription>
          {ticket ? (
            <Ticket key={ticket.id} ticket={ticket} disabled={q.isFetching || q.isError} />
          ) : (
            <p className="mt-5">
              This ticket is no longer in the loaded results. Close details and refresh or change
              the status filter.
            </p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
function Ticket({ ticket: t, disabled }: { ticket: SupportTicket; disabled: boolean }) {
  const [conversationBusy, setConversationBusy] = useState(false);
  const [note, setNote] = useState(t.status === "resolved" ? "" : t.note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient(),
    lock = useRef(false);
  async function save(status: string) {
    if (lock.current || disabled || conversationBusy || note.trim().length < 3) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await support.update(t, status, note);
      await client.invalidateQueries({ queryKey: ["admin-support"] });
      void client.invalidateQueries({ queryKey: ["support-messages", t.id] });
      setNote("");
      toast.success(status === "resolved" ? "Resolution recorded" : "Ticket marked in progress");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <article className="min-w-0 break-words space-y-3 rounded-xl border bg-card p-4">
      <p className="support-ticket-id">
        Ticket {t.id} · Updated {financeDate(t.updatedAt)} (IST)
      </p>
      <h2 className="font-semibold">
        {t.shopName} · Order {t.orderId.slice(0, 8)}
      </h2>
      <Button asChild variant="outline">
        <Link to="/admin/orders" search={{ orderId: t.orderId }}>
          View order
        </Link>
      </Button>
      <p className="text-sm">
        {t.kind.replaceAll("_", " ")} · {t.status.replaceAll("_", " ")} · {financeDate(t.createdAt)}
      </p>
      <p className="whitespace-pre-wrap break-words">{t.description}</p>
      {t.status === "resolved" ? (
        <p className="whitespace-pre-wrap break-words">Resolution: {t.note}</p>
      ) : (
        <>
          <label className="block">
            Buyer-visible update / resolution
            <Textarea
              disabled={disabled || busy || conversationBusy}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled || busy || conversationBusy || note.trim().length < 3}
              variant="outline"
              onClick={() => void save("in_progress")}
            >
              Mark in progress
            </Button>
            <Button
              disabled={disabled || busy || conversationBusy || note.trim().length < 3}
              onClick={() => void save("resolved")}
            >
              Resolve ticket
            </Button>
          </div>
        </>
      )}
      <SupportConversation
        ticket={t}
        disabled={busy || disabled}
        onBusyChange={setConversationBusy}
      />
      {error && <p role="alert">{error} Refresh tickets before retrying.</p>}
    </article>
  );
}
