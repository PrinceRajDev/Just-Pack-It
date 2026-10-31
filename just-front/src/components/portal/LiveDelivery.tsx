import { SettlementLedger } from "./SettlementLedger";
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { delivery } from "@/services/delivery";
import { useAuth } from "@/stores/auth";
import type { LiveDeliveryTask } from "@/domain/live-delivery";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/image";
export function LiveDelivery() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { session, signOut } = useAuth();
  const profile = useQuery({
    queryKey: ["delivery-profile", session?.userId],
    queryFn: delivery.profile,
    retry: false,
  });
  const active = useQuery({
    queryKey: ["delivery-active", session?.userId],
    queryFn: delivery.active,
    refetchInterval: 15000,
    retry: false,
  });
  const tasks = useInfiniteQuery({
    queryKey: ["delivery-available", session?.userId, profile.data?.online, profile.data?.version],
    queryFn: ({ pageParam }) => delivery.available(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next ?? undefined,
    enabled: !!profile.data?.approved && !!profile.data.online && active.isSuccess && !active.data,
    refetchInterval: 15000,
    retry: false,
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  async function availability(online: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await delivery.availability(online);
      await client.invalidateQueries({ queryKey: ["delivery-profile"] });
      await client.invalidateQueries({ queryKey: ["delivery-available"] });
    } catch {
      setError("Availability update failed. Retry; no change is assumed.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!profile.data?.online) return;
    void delivery
      .availability(true)
      .then(() => client.invalidateQueries({ queryKey: ["delivery-available"] }))
      .catch(() =>
        setError("Could not renew availability. Go offline and online again before claiming."),
      );
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void delivery
          .availability(true)
          .catch(() => setError("Availability heartbeat failed. Refresh before claiming tasks."));
    }, 30000);
    return () => clearInterval(timer);
  }, [profile.data?.online, client]);
  async function claim(task: LiveDeliveryTask) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await delivery.claim(task);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm claim. Refresh active task before retrying.",
      );
    } finally {
      await client.invalidateQueries({ queryKey: ["delivery-active"] });
      await client.invalidateQueries({ queryKey: ["delivery-available"] });
      setBusy(false);
    }
  }
  return (
    <div className="delivery-workspace min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-primary p-4 text-primary-foreground">
        <p className="font-semibold">{session?.name} · Delivery desk</p>
        <Button variant="outline" className="text-foreground" onClick={signOut}>
          Sign out
        </Button>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 p-4 pb-16">
        <h1 className="font-display text-3xl">Your delivery desk</h1>
        <p className="text-sm">
          Claim one ready shop order at a time. No guaranteed task availability, arrival estimate or
          payout is implied.
        </p>
        <Link to="/delivery" className="underline">
          Tasks
        </Link>
        <Link to="/delivery/earnings" className="ml-4 underline">
          Cash handover
        </Link>
        {path.includes("earnings") ? (
          <SettlementLedger />
        ) : (
          <>
            {profile.isPending ? (
              <p role="status">Checking delivery approval…</p>
            ) : profile.isError ? (
              <p role="alert">Could not check approval. Refresh below.</p>
            ) : !profile.data?.approved ? (
              <p>
                Admin must approve your delivery account and assign service areas before you can
                claim tasks.
              </p>
            ) : (
              <Button disabled={busy} onClick={() => void availability(!profile.data?.online)}>
                {profile.data.online ? "Go offline" : "Go online"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                void profile.refetch();
                void active.refetch();
                if (!active.data && profile.data?.online) void tasks.refetch();
              }}
            >
              Refresh tasks
            </Button>
            {notice && <p role="status">{notice}</p>}
            {error && <p role="alert">{error}</p>}
            {active.isPending ? (
              <p role="status">Loading active task…</p>
            ) : active.isError ? (
              <p role="alert">
                Could not refresh active task.{" "}
                {active.data
                  ? "Last loaded task remains below; refresh before acting."
                  : "Check again before claiming."}
              </p>
            ) : null}
            {active.data ? (
              <DeliveryTask
                key={`${active.data.id}:${active.data.version}`}
                task={active.data}
                onSaved={(message) => {
                  if (message) setNotice(message);
                  void active.refetch();
                  if (!active.data && profile.data?.online) void tasks.refetch();
                }}
              />
            ) : (
              active.isSuccess && (
                <section className="space-y-3">
                  <h2 className="font-display text-2xl">Available shop pickups</h2>
                  {!profile.data?.online ? (
                    <p>Go online after approval to see available tasks.</p>
                  ) : tasks.isPending ? (
                    <p role="status">Loading available tasks…</p>
                  ) : (
                    <>
                      {tasks.isError && (
                        <p role="alert">
                          Could not refresh available tasks. Refresh or retry; displayed tasks may
                          have changed.
                        </p>
                      )}
                      {tasks.data?.pages
                        .flatMap((p) => p.items)
                        .map((task) => (
                          <article
                            key={task.id}
                            className="space-y-2 rounded-xl border border-border bg-card p-4"
                          >
                            <h3 className="font-semibold">{task.shopName}</h3>
                            <p>
                              {task.itemCount} items ·{" "}
                              {task.paymentMethod === "cod"
                                ? `Collect ${inr(task.amountToCollect)} at drop-off`
                                : "Prepaid — no cash"}
                            </p>
                            <p className="text-sm">
                              Customer details appear only after a successful claim.
                            </p>
                            <Button
                              disabled={busy || active.isError}
                              onClick={() => void claim(task)}
                            >
                              Claim task
                            </Button>
                          </article>
                        ))}
                      {tasks.isSuccess && !tasks.data.pages.some((p) => p.items.length) && (
                        <p>
                          No ready tasks available in your assigned areas. Availability is checked
                          every15seconds while active.
                        </p>
                      )}
                      {(tasks.hasNextPage || tasks.isFetchNextPageError) && (
                        <Button
                          variant="outline"
                          disabled={tasks.isFetching}
                          onClick={() => void tasks.fetchNextPage()}
                        >
                          {tasks.isFetchNextPageError ? "Retry more tasks" : "Load more tasks"}
                        </Button>
                      )}
                    </>
                  )}
                </section>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
function navigation(
  address: string | undefined,
  location?: { coordinates: [number, number] } | null,
) {
  return location
    ? `https://www.google.com/maps/dir/?api=1&destination=${location.coordinates[1]},${location.coordinates[0]}`
    : address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
      : null;
}
function DeliveryTask({
  task,
  onSaved,
}: {
  task: LiveDeliveryTask;
  onSaved: (message?: string) => void;
}) {
  const { session } = useAuth();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [confirm, setConfirm] = useState(false),
    [contact, setContact] = useState<{ buyer: string | null; shop: string | null } | null>(null);
  async function run(action: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      onSaved(message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Action not confirmed. Refresh task before retrying.",
      );
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  const drop = task.drop
    ? `${task.drop.line1}, ${task.drop.locality}, ${task.drop.city} ${task.drop.pincode}`
    : undefined;
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card p-5"
      aria-label="Active delivery"
    >
      <h2 className="font-display text-2xl">{task.shopName}</h2>
      <p className="break-all text-sm">Your partner ID: {session?.userId}</p>
      <p className="break-all text-sm">
        Task {task.id} · {task.status.replaceAll("_", " ")}
      </p>
      <p>Pickup: {task.pickup ?? "Shop address not recorded; contact shop before travelling."}</p>
      <p>Drop-off: {drop ?? "Address unavailable; contact support."}</p>
      {[
        { label: "Pickup", url: navigation(task.pickup ?? undefined) },
        { label: "Drop-off", url: navigation(drop, task.drop?.location) },
      ].map(
        (link) =>
          link.url && (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="mr-4 inline-block underline"
            >
              {link.label} navigation (external map)
            </a>
          ),
      )}
      <p>
        {task.status === "returning"
          ? "Cash collection stopped — return goods to the shop"
          : task.paymentMethod === "cod"
            ? `Cash to collect: ${inr(task.amountToCollect)}`
            : "Prepaid — do not collect cash"}
        . Cash acknowledgement is not bank settlement or payout.
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void run(async () => setContact(await delivery.contact(task.id)))}
      >
        Show contact numbers
      </Button>
      {contact && (
        <div>
          {(["shop", "buyer"] as const).map((key) =>
            contact[key] && /^\+[1-9]\d{7,14}$/.test(contact[key]!) ? (
              <a key={key} className="mr-4 underline" href={`tel:${contact[key]}`}>
                Call {key}
              </a>
            ) : (
              <p key={key}>{key} contact unavailable</p>
            ),
          )}
        </div>
      )}
      <ul>
        {task.lines?.map((line, i) => (
          <li key={i}>
            {line.qty} × {line.name}
            {line.variantLabel ? ` · ${line.variantLabel}` : ""}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      {task.issue && (
        <p role="status">
          Issue reported: {task.issue.reason}. Task remains assigned; contact operations for
          assistance.
        </p>
      )}
      <details>
        <summary className="cursor-pointer">Report a delivery problem</summary>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 10) void run(() => delivery.report(task, reason.trim()));
          }}
        >
          <label className="block">
            Problem details
            <textarea
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-sm">
            This alerts operations; it does not cancel, reassign, refund or mark the order
            delivered. Keep goods/cash safe while awaiting assistance.
          </p>
          <Button variant="outline" disabled={busy || reason.trim().length < 10}>
            Report issue
          </Button>
        </form>
      </details>
      {task.status === "returning" && (
        <p role="status">
          Return these goods to the shop. The shop must verify your partner ID and acknowledge
          physical receipt before your task is released. Do not collect cash or deliver to the
          buyer.
        </p>
      )}
      {task.status === "claimed" && (
        <p role="status">
          Ask the shop to verify your partner ID and confirm pickup in its Orders screen. Your
          partner ID is shown in your account session, and the seller has the assigned ID.
        </p>
      )}
      {task.status === "picked_up" && (
        <Button disabled={busy} onClick={() => void run(() => delivery.dispatch(task))}>
          Start delivery
        </Button>
      )}
      {task.status === "out_for_delivery" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm && /^\d{6}$/.test(code))
              void run(
                () => delivery.complete(task, code),
                "Delivery completed. Buyer receipt verified; any COD cash acknowledgement was saved. Cash remittance and payouts are separate.",
              );
          }}
        >
          <p>
            Only after the buyer receives goods
            {task.paymentMethod === "cod" ? " and pays cash" : ""}, ask them for the receipt code
            from their order page.
          </p>
          <label className="block">
            Buyer receipt code
            <input
              className="ml-2 w-32 rounded border border-input bg-background p-2"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            {task.paymentMethod === "cod"
              ? `I handed over goods and actually received exactly ${inr(task.amountToCollect)} cash.`
              : "I handed over the prepaid goods. No cash was collected."}
          </label>
          <Button disabled={busy || !confirm || !/^\d{6}$/.test(code)}>
            Verify code and complete
          </Button>
        </form>
      )}
    </section>
  );
}
