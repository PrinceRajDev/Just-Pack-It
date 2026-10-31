// Explicit test-only entrypoint. The normal dev/build configuration does not load this file.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
if (process.env.VITE_API_URL !== "http://localhost:4001")
  throw new Error("QA frontend requires the isolated API on port 4001");
export default defineConfig({
  tanstackStart: { server: { entry: "server" } },
  vite: {
    server: {
      host: "127.0.0.1",
      port: 8083,
      strictPort: true,
      proxy: { "/__qa": { target: "http://127.0.0.1:4001" } },
    },
  },
});
