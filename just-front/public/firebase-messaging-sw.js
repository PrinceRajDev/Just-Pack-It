/* Native Web Push handler for data-only FCM messages. No credentials or SDK CDN. */
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  const tag = payload?.data?.tag;
  if (typeof tag !== "string" || !/^[a-f0-9-]{36}$/.test(tag)) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "jpi:push" });
      // Foreground pages use the inbox; background alerts contain no account details.
      if (windows.some((client) => client.visibilityState === "visible")) return;
      await self.registration.showNotification("Just Pack It update", {
        body: "You have a new marketplace update. Sign in to view it.",
        tag,
        renotify: false,
      });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          await client.navigate("/account");
          return;
        }
      }
      await self.clients.openWindow("/account");
    })(),
  );
});
