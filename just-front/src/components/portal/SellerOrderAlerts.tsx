import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sellerOrders } from "@/services/seller-orders";
import { Button } from "@/components/ui/button";
import { unseenOrders } from "@/lib/seller-alerts";
function play(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== "running") return;
  const oscillator = ctx.createOscillator(),
    gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.45);
}
export function SellerOrderAlerts({ shopId, onReview }: { shopId: string; onReview: () => void }) {
  const [enabled, setEnabled] = useState(false),
    [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(null),
    seen = useRef<Set<string> | null>(null);
  const query = useQuery({
    queryKey: ["seller-orders", shopId, "placed"],
    queryFn: () => sellerOrders.list("placed"),
    refetchInterval: 15000,
    retry: false,
  });
  useEffect(() => {
    if (!query.data) return;
    const ids = query.data.map((s) => `${s.orderId}:${s.id}`),
      fresh = unseenOrders(seen.current, ids);
    seen.current = new Set([...(seen.current ?? []), ...ids]);
    if (fresh.length && enabled) play(audio.current);
  }, [query.data, enabled]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  async function toggle() {
    if (enabled) {
      setEnabled(false);
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== "running") throw new Error();
      setEnabled(true);
      setError("");
      play(audio.current);
    } catch {
      setError("Sound is unavailable in this browser. Visual alerts remain available.");
    }
  }
  return (
    <section
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
      aria-label="New order alerts"
    >
      <p role="status" className="font-medium">
        {query.isError
          ? "New-order checks unavailable"
          : query.isPending
            ? "Checking new orders…"
            : `${query.data.length} orders awaiting acceptance`}
      </p>
      <Button variant="outline" onClick={() => void toggle()} aria-pressed={enabled}>
        {enabled ? "Turn sound off" : "Enable order sound"}
      </Button>
      <Button variant="outline" onClick={onReview}>
        Review new orders
      </Button>
      <p className="w-full text-sm text-muted-foreground">
        Checks every 15 seconds while this screen is active. Sound needs this page open; background
        alerts are not guaranteed.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
