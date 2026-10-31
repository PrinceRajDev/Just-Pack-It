import { expect, it } from "vitest";
import { isChunkLoadError } from "@/lib/chunk-load-error";
it.each([
  "Failed to fetch dynamically imported module: https://example.invalid/assets/route-old.js",
  "Importing a module script failed.",
  "error loading dynamically imported module",
  "Loading chunk 123 failed.",
])("recognizes browser module failures: %s", (message) => {
  expect(isChunkLoadError(new TypeError(message))).toBe(true);
});
it("does not turn API failures or ordinary rendering errors into reload recovery", () => {
  for (const error of [
    new Error("Failed to fetch"),
    new Error("Stock changed"),
    new Error("Cannot read properties of undefined"),
    null,
    {},
  ]) {
    expect(isChunkLoadError(error)).toBe(false);
  }
});
