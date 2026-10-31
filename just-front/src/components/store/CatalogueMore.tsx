import { Button } from "@/components/ui/button";
export function CatalogueMore({
  hasMore,
  busy,
  error,
  onMore,
  label = "products",
}: {
  hasMore: boolean;
  busy: boolean;
  error: boolean;
  onMore: () => void;
  label?: string;
}) {
  if (!hasMore && !error) return null;
  return (
    <div className="my-6 space-y-3">
      {error && (
        <p role="alert" className="text-sm">
          Could not load more {label}. Items already shown are kept.
        </p>
      )}
      <Button variant="outline" disabled={busy} onClick={onMore}>
        {busy ? `Loading more ${label}…` : error ? `Retry more ${label}` : `Load more ${label}`}
      </Button>
    </div>
  );
}
