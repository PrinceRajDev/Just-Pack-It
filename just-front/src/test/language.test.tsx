import { translate } from "@/lib/i18n/locale";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider, LanguageSwitcher, UiText, UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
afterEach(() => {
  cleanup();
  localStorage.removeItem("jpi.language");
  document.documentElement.lang = "en-IN";
});
function Example() {
  const [name, setName] = useState("");
  return (
    <LanguageProvider>
      <LanguageSwitcher />
      <button>
        <UiText>Add product</UiText>
      </button>
      <UiAttributes>
        <input
          aria-label="Product name"
          placeholder="Product name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </UiAttributes>
      <select aria-label="category">
        <option value="grocery">
          <UiText>Grocery &amp; Kirana</UiText>
        </option>
      </select>
    </LanguageProvider>
  );
}
it("switches text, accessible labels and placeholders without losing a seller draft", () => {
  render(<Example />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "My actual product" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Language / भाषा" }), {
    target: { value: "hi" },
  });
  expect(screen.getByRole("button", { name: "उत्पाद जोड़ें" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "उत्पाद का नाम" })).toHaveValue("My actual product");
  expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "उत्पाद का नाम");
  expect(screen.getByRole("combobox", { name: "category" })).toHaveValue("grocery");
  expect(document.documentElement.lang).toBe("hi-IN");
  expect(localStorage.getItem("jpi.language")).toBe("hi");
});
it("restores a stored preference and can return to English", () => {
  localStorage.setItem("jpi.language", "hi");
  render(<Example />);
  expect(screen.getByRole("button", { name: "उत्पाद जोड़ें" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Language / भाषा" }), {
    target: { value: "en" },
  });
  expect(screen.getByRole("button", { name: "Add product" })).toBeInTheDocument();
});
it("keeps unknown shop names and product identifiers unchanged", () => {
  expect(translate("Prince local shop 123", "hi")).toBe("Prince local shop 123");
  expect(translate("/seller/products/new", "hi")).toBe("/seller/products/new");
});
it("reflects preference changes from another tab without remounting fields", () => {
  render(<Example />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unfinished listing" } });
  fireEvent(window, new StorageEvent("storage", { key: "jpi.language", newValue: "hi" }));
  expect(screen.getByRole("textbox")).toHaveValue("Unfinished listing");
  expect(screen.getByRole("button", { name: "उत्पाद जोड़ें" })).toBeInTheDocument();
});
