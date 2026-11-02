import { createContext, useContext } from "react";
import { hindi } from "./hi";
export type Language = "en" | "hi";
export const Context = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({
  language: "en",
  setLanguage: () => {},
});
export function translate(text: string, language: Language): string {
  if (language === "en") return text;
  const trimmed = text.trim().replace(/\s+/g, " ");
  const translated = hindi[trimmed];
  return translated ? text.replace(text.trim(), translated) : text;
}
export function useLanguage() {
  return useContext(Context);
}
