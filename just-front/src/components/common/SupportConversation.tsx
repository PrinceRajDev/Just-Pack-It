import { UiText, UiAttributes } from "@/lib/i18n/Language";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { support } from "@/services/support";
import type { SupportTicket } from "@/domain/support";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function SupportConversation({
  ticket,
  onBusyChange,
  disabled = false,
}: {
  ticket: SupportTicket;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ body: string; key: string; reopen: boolean } | null>(null),
    lock = useRef(false);
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["support-messages", ticket.id],
    queryFn: ({ pageParam }) => support.messages(ticket.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.next,
    retry: false,
    refetchInterval: 30000,
  });
  const reopen = ticket.status === "resolved";
  async function send() {
    if (disabled || lock.current || body.trim().length < (reopen ? 10 : 1)) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    const value = body.trim();
    if (!pending.current || pending.current.body !== value || pending.current.reopen !== reopen)
      pending.current = { body: value, reopen, key: crypto.randomUUID() };
    try {
      await support.reply(ticket, value, pending.current.key, reopen);
      pending.current = null;
      setBody("");
      await client.invalidateQueries({ queryKey: ["admin-support"] });
      await client.invalidateQueries({ queryKey: ["order-support"] });
      await client.invalidateQueries({ queryKey: ["support-messages", ticket.id] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Message delivery was not confirmed. Retry the same text to avoid duplicates.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      lock.current = false;
    }
  }
  return (
    <UiAttributes>
      <section
        className="space-y-3 rounded border border-border p-3"
        aria-label="Support conversation"
      >
        <h3 className="font-semibold">
          <UiText>{"Conversation"}</UiText>
        </h3>
        <p className="text-xs text-muted-foreground">
          Messages are visible to this buyer and platform admins. Do not share passwords, OTPs or
          payment credentials. Checks for updates every30seconds while active.
        </p>
        {query.isPending ? (
          <p role="status">
            <UiText>{"Loading conversation…"}</UiText>
          </p>
        ) : (
          <ol className="space-y-3">
            {query.data?.pages
              .flatMap((p) => p.items)
              .map((message) => (
                <li key={message.id} className="rounded bg-secondary p-3 text-sm">
                  <p className="font-semibold">
                    <UiText>{message.role === "admin" ? "Platform support" : "Buyer"}</UiText> ·{" "}
                    <UiText>
                      {message.kind === "reopen"
                        ? "Reopened"
                        : message.kind === "status"
                          ? "Status update"
                          : "Reply"}
                    </UiText>
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    <UiText>{message.body}</UiText>
                  </p>
                  <time className="text-xs" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    <UiText>{"· India time"}</UiText>
                  </time>
                </li>
              ))}
          </ol>
        )}
        {query.isError && (
          <p role="alert">Conversation refresh failed; showing any previously loaded replies.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <UiText>{"Refresh conversation"}</UiText>
          </Button>
          {query.hasNextPage && (
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage()}
            >
              <UiText>{"More messages"}</UiText>
            </Button>
          )}
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="block text-sm">
            <UiText>{reopen ? "Reason to reopen (at least 10 characters)" : "Your reply"}</UiText>
            <Textarea
              value={body}
              maxLength={2000}
              disabled={busy || disabled}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {reopen && (
            <p className="text-sm">
              Reopening requests another review. It does not change your order or issue a refund.
            </p>
          )}
          <Button disabled={disabled || busy || body.trim().length < (reopen ? 10 : 1)}>
            <UiText>{busy ? "Sending…" : reopen ? "Reopen ticket" : "Send reply"}</UiText>
          </Button>
        </form>
        {error && (
          <p role="alert">{error} Refresh ticket status if it changed; your text is kept.</p>
        )}
      </section>
    </UiAttributes>
  );
}
