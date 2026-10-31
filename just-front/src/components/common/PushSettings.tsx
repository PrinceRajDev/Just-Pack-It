import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { browserPush, pushConfigured } from "@/services/push";
import { useAuth } from "@/stores/auth";
export function PushSettings() {
  const { session } = useAuth();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const key = ["notifications", session?.userId, session?.role];
  const status = useQuery({
    queryKey: [...key, "push"],
    queryFn: browserPush.status,
    enabled: pushConfigured,
  });
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const refresh = (event: MessageEvent) => {
      if (event.data?.type === "jpi:push")
        void client.invalidateQueries({ queryKey: ["notifications"] });
    };
    navigator.serviceWorker.addEventListener("message", refresh);
    return () => navigator.serviceWorker.removeEventListener("message", refresh);
  }, [client]);
  const change = useMutation({
    mutationFn: async () => {
      setMessage("");
      if (status.data?.subscribed) await browserPush.disable();
      else await browserPush.enable();
    },
    onSuccess: () => {
      setMessage("Browser alert preference saved for this login.");
      void client.invalidateQueries({ queryKey: [...key, "push"] });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error && !error.message.startsWith("Firebase:")
          ? error.message
          : "Couldn’t configure browser alerts. Try again or check browser permissions.",
      ),
  });
  if (!pushConfigured) return null;
  return (
    <section className="mt-5 rounded-md border border-border p-3" aria-label="Browser alerts">
      <p className="text-sm font-medium">Browser alerts</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Optional generic alerts on this browser. Delivery depends on browser and system settings.
        Re-enable after a new login.
      </p>
      {status.isError ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => status.refetch()}>
          Retry alert settings
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={status.isPending || !status.data?.available || change.isPending}
          onClick={() => change.mutate()}
        >
          {change.isPending
            ? "Saving…"
            : status.data?.subscribed
              ? "Turn off browser alerts"
              : "Enable browser alerts"}
        </Button>
      )}
      {status.data && !status.data.available && (
        <p className="mt-2 text-xs">Browser push is not enabled on the server yet.</p>
      )}
      {message && (
        <p className="mt-2 text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
