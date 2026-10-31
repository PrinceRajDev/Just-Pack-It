import { financeDate } from "@/lib/finance-date";
import { FinancialTable, FinanceEmpty } from "./FinancePresentation";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { settlements } from "@/services/settlements";
import { useAuth } from "@/stores/auth";
import type { SettlementRow } from "@/domain/settlements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/image";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function SettlementLedger({ adminLayout = false }: { adminLayout?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { session } = useAuth(),
    role = session?.role;
  const [draft, setDraft] = useState(""),
    [filter, setFilter] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["settlement-ledger", session?.userId, role, filter],
    queryFn: ({ pageParam }) => settlements.list(filter ? { suborderId: filter } : {}, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const selectedRow = rows.find((row) => row.id === selected);
  const compact = adminLayout && role === "admin";
  return (
    <section
      className={
        compact
          ? "finance-panel space-y-4"
          : "my-6 space-y-4 rounded-xl border border-border bg-card p-5"
      }
      aria-label="Cash and seller settlement ledger"
    >
      <h2 className="finance-panel-title font-display text-2xl">
        {compact && <BookOpen aria-hidden="true" />}
        {role === "delivery"
          ? "Cash handover ledger"
          : role === "seller"
            ? "Your seller settlement statement"
            : "Cash & seller settlement ledger"}
      </h2>
      <p className="text-sm">
        Zero commission. Seller-delivery fee belongs to the seller; platform-delivery fee belongs to
        the platform. Partner cash handover, admin receipt and manual seller payout are separate
        records. No automatic bank transfer or verified bank balance is provided.
      </p>
      {role === "delivery" && (
        <p className="text-sm">
          This is collected cash custody, not your earnings or delivery payout. Hand over the full
          collected amount for each shop order.
        </p>
      )}
      <form
        className={compact ? "finance-toolbar" : "flex flex-wrap items-end gap-3"}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft || uuid.test(draft)) setFilter(draft.toLowerCase());
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          Shop-order part ID (optional)
          <Input
            placeholder="Enter shop-order part ID…"
            value={draft}
            onChange={(e) => setDraft(e.target.value.trim())}
            aria-invalid={!!draft && !uuid.test(draft)}
          />
        </label>
        <Button variant="outline" disabled={!!draft && !uuid.test(draft)}>
          Find settlement record
        </Button>
        {compact && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft("");
              setFilter("");
            }}
          >
            Clear ledger lookup
          </Button>
        )}
      </form>
      {query.isPending ? (
        <div role="status" aria-label="Loading delivered order settlements">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <>
          {compact ? (
            <FinancialTable
              rows={rows}
              rowKey={(row) => row.id}
              columns={[
                {
                  title: "Shop / order",
                  cell: (row) => (
                    <>
                      <b>{row.shopName}</b>
                      <small>{row.orderId}</small>
                      <small>Part {row.id}</small>
                    </>
                  ),
                },
                {
                  title: "Collected/captured allocation",
                  cell: (row) =>
                    row.grossAmount === null ? "Proof incomplete" : inr(row.grossAmount),
                },
                {
                  title: "Partner cash custody",
                  cell: (row) => (
                    <>
                      {inr(row.partnerCollection)}
                      <small>
                        {row.remittance?.state === "received"
                          ? "Admin receipt acknowledged"
                          : row.remittance?.state === "submitted"
                            ? "Partner reports handover; receipt pending"
                            : "No admin receipt"}
                      </small>
                    </>
                  ),
                },
                {
                  title: "Payout allocation",
                  cell: (row) => (
                    <>
                      {row.payoutAmount === null ? "Not established" : inr(row.payoutAmount)}
                      <small>
                        {row.payout?.state === "recorded"
                          ? "External transfer recorded"
                          : row.payout?.state === "prepared"
                            ? "Intent prepared; transfer not recorded"
                            : "No transfer recorded"}
                      </small>
                    </>
                  ),
                },
                {
                  title: "Ledger",
                  cell: (row) => (
                    <span className={`finance-badge ${row.posted ? "" : "pending"}`}>
                      {row.posted ? "Posted" : "Awaiting proof review"}
                    </span>
                  ),
                },
                {
                  title: "Actions",
                  cell: (row) => (
                    <Button variant="outline" onClick={() => setSelected(row.id)}>
                      View settlement details
                    </Button>
                  ),
                },
              ]}
            />
          ) : (
            rows.map((row) => <LedgerRow key={row.id} row={row} role={role ?? ""} />)
          )}
          {query.isSuccess && !query.data.pages.some((p) => p.items.length) && (
            <FinanceEmpty kind="ledger" title="No settlement records found">
              No delivered live shop orders in this view. Pending collections or test orders are not
              payable balances.
            </FinanceEmpty>
          )}
        </>
      )}
      {query.isError && (
        <p role="alert">
          Could not refresh the ledger. Loaded records may be stale. Refresh before any cash
          handover or external transfer.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh settlement ledger
        </Button>
        {query.hasNextPage && (
          <Button disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
            More settlement records
          </Button>
        )}
      </div>
      {compact && (
        <Sheet
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <SheetContent className="finance-drawer">
            <SheetTitle>Settlement record details</SheetTitle>
            <SheetDescription>
              Cash custody, ledger posting and manual payout are separate records. This screen never
              transfers money.
            </SheetDescription>
            {selectedRow ? (
              <fieldset disabled={query.isFetching || query.isError}>
                <legend className="sr-only">Settlement actions</legend>
                <LedgerRow key={selectedRow.id} row={selectedRow} role={role ?? ""} />
              </fieldset>
            ) : (
              <p>Record unavailable in this view. Close and refresh the ledger.</p>
            )}
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
function LedgerRow({ row, role }: { row: SettlementRow; role: string }) {
  const [confirmed, setConfirmed] = useState(false),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [showJournals, setShowJournals] = useState(false);
  const lock = useRef(false),
    client = useQueryClient();
  const journals = useQuery({
    queryKey: ["settlement-journals", row.id],
    queryFn: () => settlements.journals(row.id),
    enabled: role === "admin" && showJournals,
    retry: false,
  });
  const refValid = /^[A-Za-z0-9][A-Za-z0-9 /_.:-]{5,119}$/.test(reference.trim());
  async function run(action: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setConfirmed(false);
      setReference("");
      setNotice(message);
      await client.invalidateQueries({ queryKey: ["settlement-ledger"] });
      void client.invalidateQueries({ queryKey: ["settlement-journals", row.id] });
      void client.invalidateQueries({ queryKey: ["admin-audit"] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Recording was not confirmed. Refresh and recover the same record. Do not transfer money again.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <article className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-semibold">{row.shopName}</h3>
      <p className="break-all text-xs">
        Shop part {row.id} · Order {row.orderId}
      </p>
      <div className="finance-event-dates">
        <p>Partner handover reported: {financeDate(row.remittance?.submittedAt)}</p>
        <p>Admin cash receipt acknowledged: {financeDate(row.remittance?.receivedAt)}</p>
        <p>Payout intent prepared: {financeDate(row.payout?.preparedAt)}</p>
        <p>External payout recorded: {financeDate(row.payout?.recordedAt)}</p>
      </div>
      {role === "admin" && row.sellerAccountId && (
        <p className="break-all text-xs">
          Seller account to verify before any transfer: {row.sellerAccountId}. Check the seller
          directory and your approved payment details outside this form.
        </p>
      )}
      {row.grossAmount === null ? (
        <p role="alert">Financial proof is incomplete; amounts are not assumed.</p>
      ) : (
        <>
          <p className="text-sm">
            Collected/captured allocation: {inr(row.grossAmount)} · Seller entitlement:{" "}
            {inr(row.sellerEntitlement ?? 0)} · Platform delivery fee:{" "}
            {inr(row.platformDeliveryFee ?? 0)}
          </p>
          <p className="text-sm">
            Already retained by seller: {inr(row.sellerRetained ?? 0)} · Manual payout allocation:{" "}
            {inr(row.payoutAmount ?? 0)}
          </p>
        </>
      )}
      <p className="text-sm">
        Ledger:{" "}
        {row.posted ? "posted with balanced entries" : "awaiting admin proof review/posting"} ·
        Policy {row.policy ?? "unverified"}
      </p>
      {row.partnerCollection > 0 && (
        <p className="text-sm">
          Partner full cash collection: {inr(row.partnerCollection)} · Handover:{" "}
          {row.remittance?.state === "received"
            ? "admin receipt acknowledged"
            : row.remittance?.state === "submitted"
              ? "partner says handed over; admin receipt pending"
              : "not acknowledged as handed over"}
        </p>
      )}
      {row.partnerCollection > 0 && (
        <p className="text-sm">
          Cash receipt still unacknowledged:{" "}
          {inr(row.remittance?.state === "received" ? 0 : row.partnerCollection)}
        </p>
      )}
      {row.payoutAmount !== null && (
        <p className="text-sm">
          Seller payout still unrecorded:{" "}
          {inr(row.payout?.state === "recorded" ? 0 : row.payoutAmount)}
        </p>
      )}
      {row.remittance?.reference && (
        <p className="break-all text-sm">Admin receipt reference: {row.remittance.reference}</p>
      )}
      {row.holdReason && <p className="text-sm">Payout hold: {row.holdReason}</p>}
      {row.payout && (
        <div className="space-y-1 rounded bg-secondary p-3 text-sm">
          <p>
            {row.payout.state === "recorded"
              ? "Manual payout recorded by admin — not bank/provider verified"
              : "Payout intent prepared. Transfer externally only once, after verifying the seller/payee."}
          </p>
          <p className="break-all">Intent ID: {row.id}</p>
          {row.payout.reference && (
            <p className="break-all">Transfer reference: {row.payout.reference}</p>
          )}
          {row.payout.state === "prepared" && (
            <p>
              If a transfer is pending, uncertain or the page reloads, recover this intent. Never
              initiate a replacement transfer merely because confirmation was lost.
            </p>
          )}
        </div>
      )}
      {role === "admin" && !row.posted && (
        <Button
          variant="outline"
          disabled={busy || !row.proofValid}
          onClick={() =>
            void run(
              () => settlements.post(row),
              "Collection posted to the ledger. No money was transferred.",
            )
          }
        >
          Review proofs and post collection
        </Button>
      )}
      {role === "delivery" && row.posted && row.partnerCollection > 0 && !row.remittance && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmed)
              void run(
                () => settlements.submitCash(row),
                "Handover acknowledgement submitted. Admin receipt is still required.",
              );
          }}
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I actually handed over the full {inr(row.partnerCollection)} collected cash for this
            shop order to operations.
          </label>
          <Button disabled={busy || !confirmed}>Submit cash handover acknowledgement</Button>
        </form>
      )}
      {role === "admin" && row.posted && row.remittance?.state === "submitted" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmed && refValid)
              void run(
                () => settlements.receiveCash(row, reference.trim()),
                "Admin cash receipt recorded. This does not record any bank deposit or seller payout.",
              );
          }}
        >
          <label className="block text-sm">
            Unique cash receipt reference
            <Input
              value={reference}
              minLength={6}
              maxLength={120}
              disabled={busy}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I counted and actually received exactly {inr(row.partnerCollection)} for this
            collection.
          </label>
          <Button disabled={busy || !confirmed || !refValid}>Record actual cash receipt</Button>
        </form>
      )}
      {role === "admin" &&
        row.posted &&
        !row.payout &&
        !row.holdReason &&
        (row.payoutAmount ?? 0) > 0 && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmed)
                void run(
                  () => settlements.prepare(row),
                  "Unique payout intent prepared. No transfer was initiated by this website.",
                );
            }}
          >
            <p className="text-sm">
              Prepare this intent BEFORE the external bank/UPI transfer. It reserves this shop-order
              allocation and cannot be replaced with a second payout.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I verified the actual seller and intended payee outside this form. I will use this
              single intent for {inr(row.payoutAmount ?? 0)}.
            </label>
            <Button disabled={busy || !confirmed}>Prepare manual payout intent</Button>
          </form>
        )}
      {role === "admin" && row.payout?.state === "prepared" && !row.holdReason && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmed && refValid)
              void run(
                () => settlements.record(row, reference.trim()),
                "External manual transfer recorded. This is an admin acknowledgement, not bank API verification.",
              );
          }}
        >
          <label className="block text-sm">
            Unique bank/UPI transaction reference
            <Input
              value={reference}
              minLength={6}
              maxLength={120}
              disabled={busy}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I already completed and checked the one external transfer of{" "}
            {inr(row.payoutAmount ?? 0)} to the verified seller.
          </label>
          <p className="text-xs">
            Reference only. Never enter bank password, account credentials, OTP or payment API
            secrets.
          </p>
          <Button disabled={busy || !confirmed || !refValid}>Record completed manual payout</Button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error} Refresh before retrying. Do not hand over cash or transfer money twice.
        </p>
      )}
      {role === "admin" && row.posted && (
        <>
          <Button variant="outline" onClick={() => setShowJournals((v) => !v)}>
            {showJournals ? "Hide journal entries" : "View journal entries"}
          </Button>
          {showJournals &&
            (journals.isPending ? (
              <p role="status">Loading journal…</p>
            ) : journals.isError ? (
              <p role="alert">Journal unavailable. Refresh the ledger.</p>
            ) : (
              <ul className="space-y-3 text-xs">
                {journals.data.map((j) => (
                  <li className="rounded bg-secondary p-3" key={j.id}>
                    <p className="font-semibold">{j.kind.replaceAll("_", " ")}</p>
                    {j.entries.map((e) => (
                      <p key={e.account} className="break-all">
                        {e.account}: {e.deltaCents} paise
                      </p>
                    ))}
                    <p>Balanced sum: {j.entries.reduce((sum, e) => sum + e.deltaCents, 0)} paise</p>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
    </article>
  );
}
