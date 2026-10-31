import { api } from "@/lib/api/client";
import type { SupportTicket } from "@/domain/support";
export interface SupportMessage {
  id: string;
  role: string;
  kind: string;
  body: string;
  createdAt: string;
}
export const support = {
  messages: (id: string, cursor?: string) =>
    api<{ items: SupportMessage[]; next?: string }>(
      `/support/${id}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  reply: (ticket: SupportTicket, body: string, key: string, reopen = false) =>
    api(`/support/${ticket.id}/${reopen ? "reopen" : "messages"}`, {
      method: "POST",
      body: JSON.stringify({ version: ticket.version, body, key }),
      signal: AbortSignal.timeout(30000),
    }),
  list: (orderId?: string, after?: string, status?: SupportTicket["status"], q?: string) =>
    api<{ items: SupportTicket[]; next?: string }>(
      `/support?${new URLSearchParams({ ...(orderId ? { orderId } : {}), ...(after ? { after } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) })}`,
    ),
  create: (input: { orderId: string; suborderId: string; kind: string; description: string }) =>
    api<SupportTicket>("/support", { method: "POST", body: JSON.stringify(input) }),
  update: (ticket: SupportTicket, status: string, note: string) =>
    api<void>(`/support/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: ticket.version, status, note }),
    }),
};
