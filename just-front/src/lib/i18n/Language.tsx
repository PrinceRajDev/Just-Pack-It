import {
  useEffect,
  useState,
  type ReactNode,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { Context, useLanguage, translate, type Language } from "./locale";
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, update] = useState<Language>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem("jpi.language") === "hi") update("hi");
    } catch {
      /* Session preference still works. */
    }
    const receive = (event: StorageEvent) => {
      if (event.key === "jpi.language") update(event.newValue === "hi" ? "hi" : "en");
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "hi" ? "hi-IN" : "en-IN";
  }, [language]);
  return (
    <Context.Provider
      value={{
        language,
        setLanguage: (next) => {
          update(next);
          try {
            localStorage.setItem("jpi.language", next);
          } catch {
            /* Storage may be blocked. */
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function UiText({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  return <>{typeof children === "string" ? translate(children, language) : children}</>;
}
export function UiAttributes({ children }: { children: ReactElement }) {
  const { language } = useLanguage();
  if (!isValidElement(children)) return children;
  const props = children.props as Record<string, unknown>;
  const translated: Record<string, unknown> = {};
  // `label` can be an internal discriminator (e.g. PortalShell's Seller/Admin).
  // Translate visible labels in UiText, never rewrite their component inputs.
  for (const key of [
    "placeholder",
    "title",
    "aria-label",
    "body",
    "hint",
    "message",
    "sub",
    "eyebrow",
  ]) {
    if (typeof props[key] === "string") translated[key] = translate(props[key] as string, language);
  }
  return cloneElement(children, translated);
}
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <label className="language-switcher">
      <span className="sr-only">Language / भाषा</span>
      <select
        aria-label="Language / भाषा"
        value={language}
        onChange={(event) => setLanguage(event.target.value === "hi" ? "hi" : "en")}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="hi" lang="hi">
          हिन्दी
        </option>
      </select>
    </label>
  );
}
