import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
const source = readFileSync(resolve("public/firebase-messaging-sw.js"), "utf8");
function worker(visible = false) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const page = {
    visibilityState: visible ? "visible" : "hidden",
    url: "https://market.test/",
    postMessage: vi.fn(),
    focus: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
  };
  const showNotification = vi.fn(async () => {}),
    openWindow = vi.fn(async () => {});
  runInNewContext(source, {
    URL,
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler;
      },
      location: { origin: "https://market.test" },
      registration: { showNotification },
      clients: { matchAll: async () => [page], openWindow },
    },
  });
  const push = async (payload: unknown) => {
    let pending = Promise.resolve();
    handlers.push({
      data: { json: () => payload },
      waitUntil: (task: Promise<void>) => {
        pending = task;
      },
    });
    await pending;
  };
  return { handlers, page, showNotification, openWindow, push };
}
it("shows only generic background copy with a stable event tag", async () => {
  const state = worker();
  await state.push({
    data: {
      tag: "12345678-1234-4123-8123-123456789abc",
      title: "Sensitive order details",
      link: "https://attacker.invalid",
    },
  });
  expect(state.showNotification).toHaveBeenCalledWith("Just Pack It update", {
    body: "You have a new marketplace update. Sign in to view it.",
    tag: "12345678-1234-4123-8123-123456789abc",
    renotify: false,
  });
});
it("updates foreground inboxes without a duplicate system notification", async () => {
  const state = worker(true);
  await state.push({ data: { tag: "12345678-1234-4123-8123-123456789abc" } });
  expect(state.page.postMessage).toHaveBeenCalledWith({ type: "jpi:push" });
  expect(state.showNotification).not.toHaveBeenCalled();
});
it("rejects malformed push envelopes", async () => {
  const state = worker();
  await state.push({ data: { tag: "untrusted" } });
  expect(state.showNotification).not.toHaveBeenCalled();
  expect(state.page.postMessage).not.toHaveBeenCalled();
});
