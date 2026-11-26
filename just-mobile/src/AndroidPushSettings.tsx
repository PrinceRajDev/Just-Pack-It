import { useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { buyerApi } from "./api";
import { BuyerStateCard } from "./BuyerStateCard";

export function AndroidPushSettings({ token }: { token: string }) {
  if (Platform.OS !== "android" || !Constants.expoConfig?.extra?.androidPushEnabled) return null;
  return <PushSettings key={token} token={token} />;
}

function PushSettings({ token }: { token: string }) {
  const [status, setStatus] = useState<{ available: boolean; subscribed: boolean }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const update = async (enable?: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (enable) {
        const notifications = await import("expo-notifications");
        await notifications.setNotificationChannelAsync("marketplace-updates", {
          name: "Marketplace updates",
          importance: notifications.AndroidImportance.DEFAULT,
        });
        const existing = await notifications.getPermissionsAsync();
        const permission = existing.granted || !existing.canAskAgain
          ? existing : await notifications.requestPermissionsAsync();
        if (!permission.granted) throw new Error("Allow notifications in your phone settings, then try again.");
        const device = await notifications.getDevicePushTokenAsync();
        if (device.type !== "android" || typeof device.data !== "string") {
          throw new Error("Couldn’t register this device for alerts.");
        }
        await buyerApi.enablePush(token, device.data);
        setStatus({ available: true, subscribed: true });
      } else if (enable === false) {
        await buyerApi.disablePush(token);
        setStatus(previous => previous && { ...previous, subscribed: false });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t update push alerts. Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void buyerApi.pushStatus(token).then(value => {
      if (active) setStatus(value);
    }).catch(() => {
      if (active) setError("Couldn’t check push alert settings.");
    });
    return () => { active = false; };
  }, [token, attempt]);

  const action = !status && error ? "Retry push settings"
    : status?.subscribed ? "Disable push alerts"
      : status?.available ? "Enable push alerts" : undefined;
  return <BuyerStateCard
    title={status?.subscribed ? "Push alerts enabled" : "Push alerts"}
    copy={error || (busy ? "Updating push alert settings…" : !status ? "Checking push alert settings…"
      : status.subscribed ? "Marketplace updates can appear in your phone’s notifications."
        : status.available ? "Get marketplace updates in your phone’s notifications." : "Push alerts are unavailable right now.")}
    icon="bell"
    compact
    tone={error ? "error" : "info"}
    action={busy ? undefined : action}
    onAction={() => {
      if (status) void update(!status.subscribed);
      else { setError(""); setAttempt(value => value + 1); }
    }}
  />;
}
