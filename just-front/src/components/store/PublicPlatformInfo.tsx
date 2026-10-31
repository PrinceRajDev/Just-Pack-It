import { useQuery } from "@tanstack/react-query";
import { platformSettings } from "@/services/platform-settings";
import { isDemoMode } from "@/lib/config";
export function PublicPlatformInfo() {
  const q = useQuery({
    queryKey: ["public-platform-settings"],
    queryFn: platformSettings.public,
    enabled: !isDemoMode,
    retry: false,
    staleTime: 60000,
    refetchInterval: 60000,
  });
  if (isDemoMode || q.isPending) return null;
  if (q.isError)
    return (
      <div className="border-b border-border px-4 py-2 text-center text-sm">
        Marketplace contact details unavailable.{" "}
        <button type="button" className="underline" onClick={() => void q.refetch()}>
          Retry contact details
        </button>
      </div>
    );
  const s = q.data;
  if (!s.noticeEnabled && !s.supportEmail && !s.supportPhone && !s.supportHours) return null;
  return (
    <aside
      aria-label="Marketplace information"
      className="border-b border-border bg-paper px-4 py-3 text-center text-sm text-foreground"
    >
      {s.noticeEnabled && (
        <p className="mx-auto max-w-5xl whitespace-pre-wrap break-words">{s.noticeText}</p>
      )}
      {(s.supportEmail || s.supportPhone || s.supportHours) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="font-medium">Marketplace support</span>
          {s.supportPhone && (
            <a className="underline" href={`tel:${s.supportPhone}`}>
              {s.supportPhone}
            </a>
          )}
          {s.supportEmail && (
            <a className="break-all underline" href={`mailto:${s.supportEmail}`}>
              {s.supportEmail}
            </a>
          )}
          {s.supportHours && <span>{s.supportHours}</span>}
        </div>
      )}
    </aside>
  );
}
