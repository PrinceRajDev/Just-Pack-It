import { LoadingState } from "@/components/common/LoadingState";
import { UiText } from "@/lib/i18n/Language";
import { SupportConversation } from "@/components/common/SupportConversation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { support } from "@/services/support";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function OrderSupport({ orderId, suborderId }: { orderId: string; suborderId: string }) {
  const client = useQueryClient(),
    [kind, setKind] = useState("missing_item"),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["order-support", orderId, suborderId],
    queryFn: async () => {
      let after: string | undefined;
      do {
        const page = await support.list(orderId, after);
        const ticket = page.items.find((t) => t.suborderId === suborderId);
        if (ticket) return ticket;
        after = page.next;
      } while (after);
      return null;
    },
    retry: false,
  });
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await support.create({ orderId, suborderId, kind, description });
      await client.invalidateQueries({ queryKey: ["order-support", orderId] });
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit issue");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer font-medium">Help with this shop order</summary>
      <div className="mt-3 space-y-3">
        {query.isPending ? (
          <LoadingState label="Loading support…" compact />
        ) : query.isError ? (
          <div role="alert">
            Could not load support.{" "}
            <Button onClick={() => void query.refetch()}>Retry support</Button>
          </div>
        ) : query.data ? (
          <>
            <p role="status">
              Issue: {query.data.kind.replaceAll("_", " ")} ·{" "}
              {query.data.status.replaceAll("_", " ")}
            </p>
            <p className="whitespace-pre-wrap break-words">{query.data.description}</p>
            {query.data.note && (
              <p className="whitespace-pre-wrap break-words">Admin note: {query.data.note}</p>
            )}
            <SupportConversation ticket={query.data} />
            <Button variant="outline" onClick={() => void query.refetch()}>
              <UiText>{"Refresh status"}</UiText>
            </Button>
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              Issue type
              <select
                className="ml-2 rounded border bg-background p-2"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {["missing_item", "quality", "delivery", "payment", "other"].map((k) => (
                  <option key={k} value={k}>
                    {k.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Describe the issue
              <Textarea
                required
                minLength={10}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              One ticket per shop order. Reporting an issue does not cancel the order or issue a
              refund. Do not include passwords, OTPs or payment credentials.
            </p>
            <Button disabled={busy || description.trim().length < 10}>
              <UiText>{busy ? "Submitting…" : "Report issue"}</UiText>
            </Button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
