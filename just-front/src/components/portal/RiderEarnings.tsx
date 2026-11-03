import { useState, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { riderEarnings, type RiderEarning } from "@/services/rider-earnings";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function RiderEarnings() {
  const { session } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ["rider-earnings", session?.userId],
    queryFn: ({ pageParam }) => riderEarnings.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
  });
  return (
    <section className="my-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-display text-2xl">Rider earnings</h2>
      <p>
        ₹30 per successfully completed eligible delivery. Full COD cash must be handed over
        separately. New orders only; no earnings for failed or cancelled deliveries. Payments are
        manual bank/UPI transfers.
      </p>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh earnings
      </Button>
      {query.isPending ? (
        <p role="status">Loading earnings…</p>
      ) : query.isError ? (
        <p role="alert">Could not load earnings. Refresh to retry.</p>
      ) : !query.data.pages.some((p) => p.items.length) ? (
        <p>No eligible completed deliveries yet.</p>
      ) : (
        query.data.pages
          .flatMap((p) => p.items)
          .map((row) => (
            <EarningRow
              key={row.id}
              row={row}
              admin={session?.role === "admin"}
              reload={() => void query.refetch()}
            />
          ))
      )}
      {query.hasNextPage && (
        <Button disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
          Load more earnings
        </Button>
      )}
    </section>
  );
}
function EarningRow({
  row,
  admin,
  reload,
}: {
  row: RiderEarning;
  admin: boolean;
  reload: () => void;
}) {
  const [reference, setReference] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function act() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!row.payout) await riderEarnings.prepare(row.id);
      else await riderEarnings.record(row, reference);
      setMessage("Saved. Refreshing records.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not confirm. Refresh before retrying; do not transfer twice.",
      );
    } finally {
      reload();
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <article className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">
        {row.shopName} · ₹{row.amount}
      </h3>
      <p className="break-all text-sm">
        Delivery {row.id}
        {admin && ` · Rider ${row.partnerId}`}
      </p>
      <p>
        {row.payout?.state === "recorded"
          ? `External payment recorded: ${row.payout.reference}`
          : row.payout?.state === "prepared"
            ? "Payment prepared; transfer not recorded"
            : "Earned; payment pending"}
      </p>
      {row.holdReason && <p role="status">On hold: {row.holdReason}</p>}
      {admin && !row.holdReason && row.payout?.state !== "recorded" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act();
          }}
          className="space-y-3"
        >
          {row.payout && (
            <>
              <label className="block">
                Actual bank/UPI transfer reference
                <Input
                  required
                  minLength={6}
                  maxLength={120}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <label className="flex gap-2">
                <input type="checkbox" required />I verified the rider and completed the ₹30
                transfer outside this website.
              </label>
            </>
          )}
          <Button disabled={busy}>
            {busy
              ? "Saving…"
              : row.payout
                ? "Record actual ₹30 payment"
                : "Prepare ₹30 rider payment"}
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
