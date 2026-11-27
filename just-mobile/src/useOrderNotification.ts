import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { ApiError, request, type Session } from "./api";
import { sellerApi, type SellerOrder } from "./sellerApi";
import * as storage from "./deviceStorage";

export const sellerSessionKey = "jpi.seller.session";
type Destination =
  | { kind: "buyer"; orderId: string; token: string }
  | { kind: "seller"; session: Session; order?: SellerOrder };
const idPattern = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const notificationId = new RegExp(`^${idPattern}$`, "i");
const buyerLink = new RegExp(`^/orders/(${idPattern})$`, "i");
const sellerLink = new RegExp(`^/seller/orders/(${idPattern})/suborders/(${idPattern})$`, "i");

async function lookup(tag: string, token: string) {
  try {
    return (await request<{link:string}>(`/notifications/${tag}`, token)).link;
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return undefined;
    throw error;
  }
}

export function useOrderNotification(session: Session | null, ready: boolean) {
  const [tag, setTag] = useState<string>();
  const [destination, setDestination] = useState<Destination>();
  useEffect(() => {
    if (Platform.OS !== "android" || !Constants.expoConfig?.extra?.androidPushEnabled) return;
    let active = true;
    let remove: (() => void) | undefined;
    void import("expo-notifications").then(notifications => {
      if (!active) return;
      const handle = (response: ReturnType<typeof notifications.getLastNotificationResponse>) => {
        if (!response || response.actionIdentifier !== notifications.DEFAULT_ACTION_IDENTIFIER) return;
        const value = response.notification.request.content.data?.tag;
        if (typeof value !== "string" || !notificationId.test(value)) return;
        notifications.clearLastNotificationResponse();
        setTag(value);
      };
      const listener = notifications.addNotificationResponseReceivedListener(handle);
      remove = () => listener.remove();
      handle(notifications.getLastNotificationResponse());
    }).catch(() => undefined);
    return () => { active = false; remove?.(); };
  }, []);
  useEffect(() => {
    if (!ready || !tag) return;
    let active = true;
    void (async () => {
      if (session) {
        const match = buyerLink.exec(await lookup(tag, session.token) ?? "");
        if (match) return {kind:"buyer",orderId:match[1],token:session.token} as const;
      }
      const saved = await storage.getItemAsync(sellerSessionKey);
      if (!saved) return;
      const seller = JSON.parse(saved) as Session;
      if (seller?.role !== "seller" || typeof seller.token !== "string") return;
      const link = await lookup(tag, seller.token);
      const match = sellerLink.exec(link ?? "");
      if (!match && link !== "/seller/orders") return;
      const order = match ? await sellerApi.order(seller.token,match[1],match[2]) : undefined;
      const current = await storage.getItemAsync(sellerSessionKey);
      if (current !== saved) return;
      return {kind:"seller",session:seller,order} as const;
    })().then(result => { if (active && result) setDestination(result); })
      .catch(() => undefined)
      .finally(() => { if (active) setTag(undefined); });
    return () => { active = false; };
  }, [ready, session, tag]);
  return {destination, close: () => setDestination(undefined)};
}
