import { UiText, UiAttributes } from "@/lib/i18n/Language";
import type { ReactNode } from "react";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isDemoMode } from "@/lib/config";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="market-empty-state flex flex-col items-center border border-dashed border-border px-6 py-14 text-center">
      <PackageOpen className="size-8 text-muted-foreground" aria-hidden />
      <h3 className="mt-3 font-display text-xl">
        <UiText>{title}</UiText>
      </h3>
      {body && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          <UiText>{body}</UiText>
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="market-error-state flex flex-col items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
    >
      <AlertTriangle className="size-7 text-destructive" aria-hidden />
      <p className="mt-2 font-medium">{message ?? "We couldn't load this right now."}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <UiText>{"Try again"}</UiText>
        </Button>
      )}
    </div>
  );
}

export function GridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <UiAttributes>
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4"
        aria-busy="true"
        aria-label="Loading"
        role="status"
      >
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </UiAttributes>
  );
}

/** Persistent ribbon telling users they're looking at demo data. */
export function DemoBanner({ children }: { children?: ReactNode }) {
  if (!isDemoMode) return null;
  return (
    <div className="border-b border-promo/30 bg-promo/10 px-4 py-1.5 text-center text-xs text-foreground">
      <span className="label-stamp mr-2 text-promo">
        <UiText>{"Demo data"}</UiText>
      </span>
      {children ??
        "Shops, prices and orders shown are sample data. No real orders are sent to any shop."}
    </div>
  );
}
