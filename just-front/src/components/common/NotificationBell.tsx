import { UiText } from "@/lib/i18n/Language";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth";
import { isDemoMode } from "@/lib/config";
import { notifications } from "@/services/notifications";
import { safeRedirect } from "@/services/auth";
import { PushSettings } from "./PushSettings";

export function NotificationBell() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const enabled = !!session && !session.isDemo && !isDemoMode;
  const key = ["notifications", session?.userId, session?.role];
  const count = useQuery({
    queryKey: [...key, "count"],
    queryFn: notifications.count,
    enabled,
    refetchInterval: 30_000,
  });
  const list = useInfiniteQuery({
    queryKey: [...key, "list"],
    queryFn: ({ pageParam }) => notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next,
    enabled: enabled && open,
    refetchInterval: open ? 30_000 : false,
  });
  const read = useMutation({
    mutationFn: notifications.read,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  if (!enabled) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
          aria-label={`Notifications${count.data?.count ? `, ${count.data.count} unread` : ""}`}
        >
          <Bell className="size-5" aria-hidden />
          {!!count.data?.count && (
            <span
              aria-hidden
              className="absolute right-0 top-0 rounded-full bg-promo px-1.5 text-xs font-semibold text-white"
            >
              <UiText>{count.data.count > 99 ? "99+" : count.data.count}</UiText>
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetTitle className="font-display text-2xl">
          <UiText>{"Your updates"}</UiText>
        </SheetTitle>
        <SheetDescription>
          Order and marketplace updates. Refreshes while you browse.
        </SheetDescription>
        <PushSettings />
        {list.isPending && (
          <p className="mt-6" role="status">
            <UiText>{"Loading updates…"}</UiText>
          </p>
        )}
        {list.isError && (
          <div className="mt-6" role="alert">
            <p>
              <UiText>{"Couldn’t load updates."}</UiText>
            </p>
            <Button variant="outline" onClick={() => list.refetch()}>
              <UiText>{"Try again"}</UiText>
            </Button>
          </div>
        )}
        {read.isError && (
          <p role="alert" className="mt-4">
            Couldn’t mark this update as read. Try again.
          </p>
        )}
        {list.isSuccess && !list.data.pages[0].items.length && (
          <p className="mt-8 text-muted-foreground">
            You’re all caught up. New updates will appear here.
          </p>
        )}
        <ul className="mt-6 divide-y divide-border">
          {list.data?.pages
            .flatMap((page) => page.items)
            .map((item) => (
              <li
                key={item.id}
                className={`py-5 ${item.read ? "" : "border-l-2 border-l-primary pl-3"}`}
              >
                <h3 className="font-semibold">
                  <UiText>{item.title}</UiText>
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  <UiText>{item.body}</UiText>
                </p>
                <time
                  className="mt-2 block text-xs text-muted-foreground"
                  dateTime={item.createdAt}
                >
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <Link
                    to={safeRedirect(item.link, "/account")}
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium text-primary underline underline-offset-4"
                  >
                    <UiText>{"View details"}</UiText>
                  </Link>
                  {!item.read && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={read.isPending}
                      onClick={() => read.mutate(item.id)}
                    >
                      <UiText>{"Mark as read"}</UiText>
                    </Button>
                  )}
                </div>
              </li>
            ))}
        </ul>
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => list.fetchNextPage()}
          >
            <UiText>{list.isFetchingNextPage ? "Loading…" : "Older updates"}</UiText>
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
