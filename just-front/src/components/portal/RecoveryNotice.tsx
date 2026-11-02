import { UiText, UiAttributes } from "@/lib/i18n/Language";
import type { RecoveryStatus } from "@/domain/recovery";
export function RecoveryNotice({ recovery }: { recovery?: RecoveryStatus }) {
  if (!recovery) return null;
  return (
    <UiAttributes>
      <section
        className="space-y-1 rounded border bg-secondary/30 p-3 text-sm"
        aria-label="Automatic recovery checks"
      >
        {recovery.manualReview && (
          <p role="alert" className="font-semibold">
            Operator review required. Age or failed checks do not prove a payment failed or that
            stock can be released.
          </p>
        )}
        <p>
          <UiText>
            {recovery.lastCheckedAt
              ? `Last automatic check: ${new Date(recovery.lastCheckedAt).toLocaleString("en-IN")}`
              : "No automatic provider check recorded."}
          </UiText>
        </p>
        {recovery.code && (
          <p>
            Check result: {recovery.code.replaceAll("_", " ").toLowerCase()} · Consecutive errors:{" "}
            {recovery.failures}
          </p>
        )}
        {recovery.nextCheckAt && (
          <p>
            Next check eligible from {new Date(recovery.nextCheckAt).toLocaleString("en-IN")}. This
            does not confirm the recovery worker is running.
          </p>
        )}
      </section>
    </UiAttributes>
  );
}
