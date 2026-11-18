import { useEffect } from "react";
import { BackHandler } from "react-native";
const handlers = new Map<symbol, { priority: number; callback: () => boolean }>();
let subscription: ReturnType<typeof BackHandler.addEventListener> | null = null;
export function useAndroidBack(callback: () => boolean, priority = 0) {
  useEffect(() => {
    const id = Symbol("back");
    handlers.set(id, { callback, priority });
    if (!subscription) subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      for (const handler of [...handlers.values()].sort((a, b) => b.priority - a.priority)) if (handler.callback()) return true;
      return false;
    });
    return () => { handlers.delete(id); if (!handlers.size) { subscription?.remove(); subscription = null; } };
  }, [callback, priority]);
}
