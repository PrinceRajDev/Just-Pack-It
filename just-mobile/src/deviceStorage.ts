import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Native builds retain encrypted storage. Browser previews use tab-scoped
// storage, so authentication tokens are never persisted in localStorage.
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS !== "web") return SecureStore.getItemAsync(key);
  return typeof sessionStorage === "undefined"
    ? null
    : sessionStorage.getItem(key);
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS !== "web") return SecureStore.setItemAsync(key, value);
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS !== "web") return SecureStore.deleteItemAsync(key);
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
}
