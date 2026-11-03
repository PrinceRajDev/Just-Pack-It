import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LiveDeliveryTask } from "@/domain/live-delivery";
import { UiText } from "@/lib/i18n/Language";
function chime(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== "running") return;
  const tone = ctx.createOscillator(),
    gain = ctx.createGain();
  tone.connect(gain);
  gain.connect(ctx.destination);
  tone.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  tone.start();
  tone.stop(ctx.currentTime + 0.45);
}
export function RiderTaskAlerts({
  tasks,
  watching,
  ready,
  error,
}: {
  tasks: LiveDeliveryTask[];
  watching: boolean;
  ready: boolean;
  error: boolean;
}) {
  const audio = useRef<AudioContext | null>(null),
    seen = useRef<Set<string> | null>(null),
    pending = useRef(new Set<string>()),
    alive = useRef(true),
    lock = useRef(false);
  const [sound, setSound] = useState(false),
    [audioError, setAudioError] = useState(""),
    [count, setCount] = useState(0);
  useEffect(() => {
    if (!watching) {
      seen.current = null;
      pending.current.clear();
      setCount(0);
      return;
    }
    if (!ready || error) return;
    const ids = tasks.map((t) => `${t.orderId}:${t.id}`),
      current = new Set(ids);
    const fresh = seen.current === null ? [] : ids.filter((id) => !seen.current!.has(id));
    seen.current = new Set([...(seen.current ?? []), ...ids]);
    for (const id of fresh) pending.current.add(id);
    for (const id of pending.current) if (!current.has(id)) pending.current.delete(id);
    setCount(pending.current.size);
    if (fresh.length && sound) {
      try {
        chime(audio.current);
      } catch {
        setAudioError("Sound is unavailable. Visual task alerts remain active.");
        setSound(false);
      }
    }
  }, [tasks, watching, ready, error, sound]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void audio.current?.close().catch(() => {});
    };
  }, []);
  async function toggle() {
    if (lock.current) return;
    if (sound) {
      setSound(false);
      return;
    }
    lock.current = true;
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (!alive.current) return;
      if (audio.current.state !== "running") throw new Error();
      chime(audio.current);
      setSound(true);
      setAudioError("");
    } catch {
      if (alive.current) setAudioError("Sound is unavailable. Visual task alerts remain active.");
    } finally {
      lock.current = false;
    }
  }
  return (
    <section
      aria-label="New delivery task alerts"
      className="my-4 space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Bell size={20} aria-hidden="true" />
        <p role="status" aria-live="polite" className="min-w-0 flex-1">
          <UiText>
            {!watching
              ? "Task alerts paused while offline or on a delivery."
              : error
                ? "Task checks failed. Refresh tasks to retry."
                : !ready
                  ? "Checking available pickups…"
                  : count
                    ? `${count} newly available pickups. Review tasks before claiming.`
                    : "Watching for newly available pickups."}
          </UiText>
        </p>
        <Button type="button" variant="outline" onClick={() => void toggle()} aria-pressed={sound}>
          {sound ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
          <UiText>{sound ? "Turn task sound off" : "Enable task sound"}</UiText>
        </Button>
        <Button variant="outline" asChild>
          <Link
            to="/delivery/tasks"
            onClick={() => {
              pending.current.clear();
              setCount(0);
            }}
          >
            <UiText>Review delivery tasks</UiText>
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Checks every 15 seconds while online, available and this page is active. A sound plays when
        enabled, then for newly observed pickups on the first results page. This is an in-page
        alert; closed-page or background push alerts are not included. Tasks may be claimed by
        another rider.
      </p>
      {audioError && <p role="alert">{audioError}</p>}
    </section>
  );
}
