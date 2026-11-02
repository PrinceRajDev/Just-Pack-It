import { useEffect, useState } from "react";
import { UiText } from "@/lib/i18n/Language";
import { Skeleton } from "@/components/ui/skeleton";

/** Initial-load placeholder only. Background refreshes should retain existing content. */
export function LoadingState({
  label = "Loading page…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <section
      className={`market-loading-state ${compact ? "market-loading-compact" : ""}`}
      aria-busy="true"
      aria-label={label}
    >
      <div role="status" aria-live="polite" className="market-loading-caption">
        <span className="market-loading-dot" aria-hidden="true" />
        <UiText>{label}</UiText>
      </div>
      <div className="market-loading-rows" aria-hidden="true">
        {Array.from({ length: compact ? 1 : 3 }, (_, i) => (
          <div className="market-loading-row" key={i}>
            <Skeleton className="size-12 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
      {slow && (
        <p role="status" className="market-loading-slow">
          <UiText>This is taking longer than usual. Please check your connection.</UiText>
        </p>
      )}
    </section>
  );
}
