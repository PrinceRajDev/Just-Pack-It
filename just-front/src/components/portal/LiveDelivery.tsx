import { RiderEarnings } from "./RiderEarnings";
import { RiderProfile } from "./RiderProfile";
import { NeighbourhoodIllustration } from "./NeighbourhoodIllustration";
import { Home, CircleHelp, ChartNoAxesCombined, UserRound } from "lucide-react";
import { RiderOverview } from "./RiderOverview";
import { Logo } from "@/components/brand/Logo";
import { Bike, ShieldCheck, MapPin, ClipboardList, Wallet, LogOut, Clock3 } from "lucide-react";
import { LanguageSwitcher } from "@/lib/i18n/Language";
import "@/styles/delivery-workspace.css";
import { LoadingState } from "@/components/common/LoadingState";
import { UiText, UiAttributes } from "@/lib/i18n/Language";
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
    <div className="delivery-workspace rider-workspace min-h-screen bg-background">
      <aside className="dispatch-sidebar">
        <Logo inverse />
        <nav aria-label="Dispatch navigation">
          <Link
            to="/delivery"
            className={path === "/delivery" || path === "/delivery/" ? "is-active" : ""}
          >
            <Home size={21} aria-hidden="true" />
            <UiText>Overview</UiText>
          </Link>
          <Link
            to="/delivery/tasks"
            className={path.startsWith("/delivery/tasks") ? "is-active" : ""}
          >
            <ClipboardList size={21} aria-hidden="true" />
            <UiText>Delivery tasks</UiText>
            {tasks.isSuccess && (
              <span className="dispatch-task-count">
                {tasks.data.pages.reduce((n, page) => n + page.items.length, 0)}
                {tasks.hasNextPage ? "+" : ""}
              </span>
            )}
          </Link>
          <Link to="/delivery/earnings" className={path.includes("earnings") ? "is-active" : ""}>
            <Wallet size={21} aria-hidden="true" />
            <UiText>Cash handover</UiText>
          </Link>
          <Link to="/delivery/profile" className={path.includes("profile") ? "is-active" : ""}>
            <UserRound size={21} aria-hidden="true" />
            <UiText>Profile</UiText>
          </Link>
          <a href="/delivery/earnings#rider-earnings">
            <ChartNoAxesCombined size={21} aria-hidden="true" />
            <span>
              <UiText>Earnings</UiText>
              <small>
                <UiText>INR 30 per completed delivery</UiText>
              </small>
            </span>
          </a>
          <a
            href={
              path !== "/delivery" && path !== "/delivery/" ? "/delivery#rider-help" : "#rider-help"
            }
          >
            <CircleHelp size={21} aria-hidden="true" />
            <UiText>Help & support</UiText>
          </a>
        </nav>
        <div className="dispatch-sidebar-art" aria-hidden="true">
          <NeighbourhoodIllustration />
          <Bike size={110} strokeWidth={1} />
        </div>
        <Link to="/" className="dispatch-market-link">
          <UiText>Visit the marketplace</UiText> ↗
        </Link>
      </aside>
      <header className="rider-header">
        <Logo />
        <span className="rider-header-label">
          <Bike size={20} aria-hidden="true" />
          <UiText>Delivery workspace</UiText>
        </span>
        <div className="rider-header-actions">
          <LanguageSwitcher />
          <details className="dispatch-profile">
            <summary>
              <UserRound size={20} aria-hidden="true" />
              <span>{session?.name}</span>
            </summary>
            <div>
              <strong>{session?.name}</strong>
              <p>
                <UiText>Delivery partner account</UiText>
              </p>
              <Link to="/delivery/profile">
                <UiText>Manage account</UiText>
              </Link>
            </div>
          </details>
          <Button variant="outline" onClick={signOut}>
            <LogOut size={17} aria-hidden="true" />
            <UiText>Sign out</UiText>
          </Button>
        </div>
      </header>
      <main className="rider-main">
        <section className="rider-hero">
          <div>
            <p className="rider-eyebrow">
              JUST PACK IT · <UiText>Delivery partner</UiText>
            </p>
            <h1>
              <UiText>
                {path.startsWith("/delivery/tasks") ? "Your delivery tasks" : "Your delivery desk"}
              </UiText>
            </h1>
            <p>
              <UiText>From a local counter to someone’s doorstep.</UiText>
            </p>
            {profile.isSuccess && (
              <span className={`rider-state ${profile.data?.approved ? "is-approved" : ""}`}>
                <span aria-hidden="true" />{" "}
                <UiText>
                  {!profile.data?.approved
                    ? "Awaiting admin approval"
                    : profile.data.online
                      ? "Online"
                      : "Offline"}
                </UiText>
              </span>
            )}
          </div>
          <div className="rider-hero-icon" aria-hidden="true">
            <NeighbourhoodIllustration />
            <svg viewBox="0 0 200 65" fill="none">
              <path
                d="M5 45C40 3 70 64 110 34S164 6 190 25"
                stroke="#8c8a3c"
                strokeWidth="2"
                strokeDasharray="5 6"
              />
              <circle cx="188" cy="22" r="8" fill="#c5e526" stroke="#426134" />
            </svg>
          </div>
        </section>
        <nav className="rider-tabs" aria-label="Delivery workspace sections">
          <Link
            to="/delivery"
            className={path === "/delivery" || path === "/delivery/" ? "is-active" : ""}
          >
            <ClipboardList size={19} aria-hidden="true" />
            <UiText>Tasks</UiText>
          </Link>
          <Link to="/delivery/earnings" className={path.includes("earnings") ? "is-active" : ""}>
            <Wallet size={19} aria-hidden="true" />
            <UiText>Cash handover</UiText>
          </Link>
        </nav>
        {path.includes("profile") ? (
          <RiderProfile
            profile={profile.data}
            loading={profile.isPending}
            error={profile.isError}
          />
        ) : path.includes("earnings") ? (
          <>
            <div id="rider-earnings">
              <RiderEarnings />
            </div>
            <SettlementLedger />
          </>
        ) : (
          <>
            {profile.data?.approved && !path.startsWith("/delivery/tasks") && (
              <RiderOverview
                profile={profile.data}
                task={active.data}
                taskKnown={active.isSuccess}
                loadedTasks={
                  profile.data.online && tasks.isSuccess && !active.data
                    ? tasks.data.pages.reduce((n, page) => n + page.items.length, 0)
                    : undefined
                }
                hasMore={!!tasks.hasNextPage}
                updatedAt={Math.max(active.dataUpdatedAt, tasks.dataUpdatedAt)}
                refreshing={active.isFetching || tasks.isFetching}
              />
            )}
            <div className="rider-work-controls">
              {profile.isPending ? (
                <LoadingState label="Checking delivery approval…" compact />
              ) : profile.isError ? (
                <p role="alert">Could not check approval. Refresh below.</p>
              ) : !profile.data?.approved ? (
                <section className="rider-approval-card" aria-labelledby="rider-approval-heading">
                  <span className="rider-section-icon">
                    <ShieldCheck size={25} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="rider-approval-heading">
                      <UiText>Your account is ready for review</UiText>
                    </h2>
                    <p>
                      Admin must approve your delivery account and assign service areas before you
                      can claim tasks.
                    </p>
                    <ol className="rider-setup-steps">
                      <li>
                        <ShieldCheck size={18} aria-hidden="true" />
                        <span>
                          <strong>
                            <UiText>Account created</UiText>
                          </strong>
                          <UiText>You can sign in to this workspace.</UiText>
                        </span>
                      </li>
                      <li>
                        <Clock3 size={18} aria-hidden="true" />
                        <span>
                          <strong>
                            <UiText>Admin approval</UiText>
                          </strong>
                          <UiText>Waiting for your account review.</UiText>
                        </span>
                      </li>
                      <li>
                        <MapPin size={18} aria-hidden="true" />
                        <span>
                          <strong>
                            <UiText>Service area assignment</UiText>
                          </strong>
                          <UiText>Your admin will assign where you deliver.</UiText>
                        </span>
                      </li>
                    </ol>
                  </div>
                </section>
              ) : (
                <Button disabled={busy} onClick={() => void availability(!profile.data?.online)}>
                  <UiText>{profile.data.online ? "Go offline" : "Go online"}</UiText>
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
            </div>
            {notice && <p role="status">{notice}</p>}
            {error && <p role="alert">{error}</p>}
            {active.isPending ? (
              <LoadingState label="Loading active task…" compact />
            ) : active.isError ? (
              <p role="alert">
                Could not refresh active task.{" "}
                <UiText>
                  {active.data
                    ? "Last loaded task remains below; refresh before acting."
                    : "Check again before claiming."}
                </UiText>
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
                <section id="rider-task-board" className="rider-tasks-card space-y-3 scroll-mt-6">
                  <h2 className="font-display text-2xl">Ready delivery tasks</h2>
                  {!profile.data?.online ? (
                    <div className="rider-tasks-empty">
                      <Bike size={45} aria-hidden="true" />
                      <h3>
                        <UiText>
                          {profile.data?.approved
                            ? "You’re offline"
                            : "Your first delivery starts here"}
                        </UiText>
                      </h3>
                      <p>Go online after approval to see available tasks.</p>
                      <p className="rider-help">
                        <UiText>
                          Task availability depends on ready orders in your assigned areas.
                        </UiText>
                      </p>
                    </div>
                  ) : tasks.isPending ? (
                    <LoadingState label="Loading available tasks…" compact />
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
                              <UiText>
                                {task.paymentMethod === "cod"
                                  ? `Collect ${inr(task.amountToCollect)} at drop-off`
                                  : "Prepaid: no cash"}
                              </UiText>
                            </p>
                            <p className="text-sm">
                              Customer details appear only after a successful claim.
                            </p>
                            <Button
                              disabled={busy || active.isError}
                              onClick={() => void claim(task)}
                            >
                              <UiText>{"Claim task"}</UiText>
                            </Button>
                          </article>
                        ))}
                      {tasks.isSuccess && !tasks.data.pages.some((p) => p.items.length) && (
                        <p>
                          No deliveries waiting right now. New requests from shops in your assigned
                          area will appear here. We check every 15 seconds while this page is
                          active.
                        </p>
                      )}
                      {(tasks.hasNextPage || tasks.isFetchNextPageError) && (
                        <Button
                          variant="outline"
                          disabled={tasks.isFetching}
                          onClick={() => void tasks.fetchNextPage()}
                        >
                          <UiText>
                            {tasks.isFetchNextPageError ? "Retry more tasks" : "Load more tasks"}
                          </UiText>
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
    <UiAttributes>
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
                <UiText>{link.label}</UiText> navigation (external map)
              </a>
            ),
        )}
        <p>
          <UiText>
            {task.status === "returning"
              ? "Cash collection stopped: return goods to the shop"
              : task.paymentMethod === "cod"
                ? `Cash to collect: ${inr(task.amountToCollect)}`
                : "Prepaid: do not collect cash"}
          </UiText>
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
              <UiText>{line.variantLabel ? ` · ${line.variantLabel}` : ""}</UiText>
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
              <UiText>{task.paymentMethod === "cod" ? " and pays cash" : ""}</UiText>, ask them for
              the receipt code from their order page.
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
              <UiText>
                {task.paymentMethod === "cod"
                  ? `I handed over goods and actually received exactly ${inr(task.amountToCollect)} cash.`
                  : "I handed over the prepaid goods. No cash was collected."}
              </UiText>
            </label>
            <Button disabled={busy || !confirm || !/^\d{6}$/.test(code)}>
              Verify code and complete
            </Button>
          </form>
        )}
      </section>
    </UiAttributes>
  );
}
