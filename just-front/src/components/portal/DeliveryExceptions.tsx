import { LoadingState } from "@/components/common/LoadingState";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { delivery } from "@/services/delivery";
import type { DeliveryException, DeliveryResolution } from "@/domain/live-delivery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function DeliveryExceptions() {
  const [draft, setDraft] = useState(""),
    [id, setId] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["admin-delivery-exceptions", id],
    queryFn: ({ pageParam }) => delivery.exceptions(id || undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    refetchInterval: 30000,
    retry: false,
  });
  return (
    <UiAttributes>
      <section
        className="space-y-4 rounded-xl border border-border bg-card p-4"
        aria-label="Delivery exception desk"
      >
        <h2 className="font-display text-2xl">Delivery exception desk</h2>
        <p className="text-sm">
          Unclaimed ready orders, no-show assignments, reported problems and requested returns.
          Releasing a pre-pickup task lets another partner claim it. After pickup, the shop must
          confirm returned goods before cancellation.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft || uuid.test(draft)) setId(draft);
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            Task ID (optional)
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.trim())}
              aria-invalid={!!draft && !uuid.test(draft)}
            />
          </label>
          <Button variant="outline" disabled={!!draft && !uuid.test(draft)}>
            Find delivery task
          </Button>
        </form>
        {query.isPending ? (
          <LoadingState label="Loading delivery exceptions…" compact />
        ) : (
          <>
            {query.data?.pages
              .flatMap((p) => p.items)
              .map((task) => (
                <ExceptionCard key={task.id} task={task} />
              ))}
            {query.isSuccess && !query.data.pages.some((p) => p.items.length) && (
              <p>No matching unresolved delivery tasks.</p>
            )}
          </>
        )}
        {query.isError && (
          <p role="alert">
            Could not refresh delivery exceptions. Loaded records may be outdated; refresh before
            acting.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh delivery exceptions
          </Button>
          {query.hasNextPage && (
            <Button disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
              More delivery exceptions
            </Button>
          )}
        </div>
      </section>
    </UiAttributes>
  );
}
function ExceptionCard({ task }: { task: DeliveryException }) {
  const [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [goods, setGoods] = useState(false),
    [restock, setRestock] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    client = useQueryClient();
  const before = task.status === "ready" && ["claimed", "unassigned"].includes(task.deliveryState),
    canReturn = ["picked_up", "out_for_delivery"].includes(task.deliveryState),
    confirm = action === "release" || action === "cancel_before_pickup";
  const valid =
    !!action &&
    reason.trim().length >= 10 &&
    (!confirm || goods) &&
    (action !== "cancel_before_pickup" || !!restock) &&
    !task.financialReviewRequired;
  async function save() {
    if (!valid || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const common = { version: task.version, reason: reason.trim() };
    let input: DeliveryResolution;
    if (action === "release") input = { ...common, action, confirmGoodsAtShop: true };
    else if (action === "cancel_before_pickup")
      input = { ...common, action, confirmGoodsAtShop: true, restock: restock === "yes" };
    else input = { ...common, action: action as "request_return" | "resume" };
    try {
      await delivery.resolve(task.id, input);
      setAction("");
      setReason("");
      setGoods(false);
      setRestock("");
      await client.invalidateQueries({ queryKey: ["admin-delivery-exceptions"] });
      void client.invalidateQueries({ queryKey: ["admin-delivery-partners"] });
      void client.invalidateQueries({ queryKey: ["admin-audit"] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Resolution not confirmed. Refresh; your draft is kept.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <article className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="font-semibold">
        {task.shopName} · {task.deliveryState.replaceAll("_", " ")}
      </h3>
      <p className="break-all text-xs">
        Task {task.id} · Version {task.version}
        <UiText>{task.partnerId ? ` · Partner ${task.partnerId}` : ""}</UiText>
      </p>
      {task.claimedAt && (
        <p className="text-sm">
          Claimed {new Date(task.claimedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          <UiText>{"· India time"}</UiText>
        </p>
      )}
      {task.reason && (
        <p className="whitespace-pre-wrap break-words text-sm">Problem: {task.reason}</p>
      )}
      {task.financialReviewRequired ? (
        <p role="alert" className="text-sm">
          Buyer receipt or cash acknowledgement exists. Automatic cancellation/reassignment is
          blocked; investigate payment and goods with the buyer before any financial adjustment.
        </p>
      ) : task.deliveryState === "returning" ? (
        <p role="status">
          Waiting for the owning shop to receive goods and confirm the return. Partner
          responsibility stays assigned; admin cannot declare goods received on the seller's behalf.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-sm">
              Resolution action
              <UiAttributes>
                <select
                  className="mt-1 block w-full rounded border border-input bg-background p-2"
                  aria-label="Resolution action"
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value);
                    setGoods(false);
                    setRestock("");
                  }}
                >
                  <option value="">Choose an action</option>
                  {before && task.deliveryState === "claimed" && (
                    <option value="release">
                      Release for another partner to claim (before pickup)
                    </option>
                  )}
                  {before && <option value="cancel_before_pickup">Cancel before pickup</option>}
                  {canReturn && <option value="request_return">Request return to shop</option>}
                  {task.reason && task.deliveryState !== "unassigned" && (
                    <option value="resume">Clear reported issue and continue existing task</option>
                  )}
                </select>
              </UiAttributes>
            </label>
            <label className="block text-sm">
              Resolution reason
              <Textarea
                value={reason}
                maxLength={1000}
                minLength={10}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {confirm && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={goods}
                  onChange={(e) => setGoods(e.target.checked)}
                />
                I verified with the shop that all goods are still at the shop and have not been
                handed to the partner.
              </label>
            )}
            {action === "cancel_before_pickup" && (
              <label className="block text-sm">
                Returned stock decision
                <UiAttributes>
                  <select
                    className="mt-1 block w-full rounded border border-input bg-background p-2"
                    aria-label="Returned stock decision"
                    value={restock}
                    onChange={(e) => setRestock(e.target.value)}
                  >
                    <option value="">Choose after checking all goods</option>
                    <option value="yes">
                      All items are sellable: restore exact ordered quantities
                    </option>
                    <option value="no">Do not restock: goods are not confirmed sellable</option>
                  </select>
                </UiAttributes>
              </label>
            )}
            {action === "request_return" && (
              <p className="text-sm">
                This requests physical return only. No refund, restock or task release happens until
                the shop confirms receipt.
              </p>
            )}
            <Button variant="outline" disabled={!valid || busy}>
              Save delivery resolution
            </Button>
          </fieldset>
        </form>
      )}
      <Link
        to="/admin/orders"
        search={{ orderId: task.orderId }}
        className="inline-block text-sm underline"
      >
        Review order and payment records
      </Link>
      {error && <p role="alert">{error} Refresh the task before retrying.</p>}
      {!!task.history.length && (
        <details>
          <summary className="cursor-pointer text-sm">Previous delivery resolutions</summary>
          <ul className="space-y-2 pt-2 text-sm">
            {task.history.map((event, index) => (
              <li key={index}>
                {event.action.replaceAll("_", " ")} · {event.reason}
                <UiText>
                  {event.restock !== undefined
                    ? ` · Restock ${event.restock ? "confirmed" : "not performed"}`
                    : ""}
                </UiText>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
