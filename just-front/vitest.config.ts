import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Demo regressions must never inherit a developer's live API configuration.
  // API tests explicitly mock config and fetch at their boundary.
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(""),
    "import.meta.env.VITE_IMAGE_BASE_URL": JSON.stringify(""),
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
