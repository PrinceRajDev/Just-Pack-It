import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sellerOrders } from "@/services/seller-orders";
import { Button } from "@/components/ui/button";
import { unseenOrders } from "@/lib/seller-alerts";
import { PackageCheck, Volume2, VolumeX, Bell, Info } from "lucide-react";
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
    <UiAttributes>
      <section className="seller-order-alerts" aria-label="New order alerts">
        <PackageCheck className="seller-alert-icon" aria-hidden="true" />
        <p role="status" className="seller-alert-count">
          <UiText>
            {query.isError
              ? "New-order checks unavailable"
              : query.isPending
                ? "Checking new orders…"
                : `${query.data.length} orders awaiting acceptance`}
          </UiText>
        </p>
        <Button variant="outline" onClick={() => void toggle()} aria-pressed={enabled}>
          {enabled ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
          <UiText>{enabled ? "Turn sound off" : "Enable order sound"}</UiText>
        </Button>
        <Button variant="outline" onClick={onReview}>
          <Bell size={18} aria-hidden="true" />
          <UiText>{"Review new orders"}</UiText>
        </Button>
        <p className="seller-alert-help text-sm text-muted-foreground">
          <Info size={18} aria-hidden="true" />
          Checks every 15 seconds while this screen is active. Sound needs this page open;
          background alerts are not guaranteed.
        </p>
        {error && <p role="alert">{error}</p>}
      </section>
    </UiAttributes>
  );
}
