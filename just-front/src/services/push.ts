import { api } from "@/lib/api/client";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const pushConfigured =
  Object.values(firebaseConfig).every(Boolean) && !!import.meta.env.VITE_FIREBASE_VAPID_KEY;
async function messaging() {
  const [{ getApps, initializeApp }, sdk] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  if (!(await sdk.isSupported()))
    throw new Error(
      "Browser push is not supported here. On iPhone, try the installed Home Screen web app.",
    );
  const app =
    getApps().find((app) => app.name === "jpi-push") ?? initializeApp(firebaseConfig, "jpi-push");
  return { sdk, messaging: sdk.getMessaging(app) };
}
export const browserPush = {
  status: () => api<{ available: boolean; subscribed: boolean }>("/notifications/push"),
  async enable() {
    if (
      !pushConfigured ||
      !window.isSecureContext ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator)
    )
      throw new Error("Browser alerts need a supported browser and HTTPS (or localhost).");
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error(
        "Alerts were not allowed. You can change permission in your browser’s site settings.",
      );
    const { sdk, messaging: instance } = await messaging();
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    const token = await sdk.getToken(instance, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) throw new Error("No browser registration was returned. Try again.");
    try {
      await api<void>("/notifications/push", { method: "PUT", body: JSON.stringify({ token }) });
    } catch (error) {
      await sdk.deleteToken(instance).catch(() => {});
      throw error;
    }
  },
  async disable() {
    await api<void>("/notifications/push", { method: "DELETE" });
    try {
      const { sdk, messaging: instance } = await messaging();
      await sdk.deleteToken(instance);
    } catch {
      /* Server registration is already removed. */
    }
  },
};
