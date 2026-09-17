import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The SPA is being replaced by the Next.js storefront, so this harness
    // exists for the logic worth pinning now — error handling, money formatting,
    // payload shapes — rather than for component coverage that will be rewritten.
    globals: false,
  },
});
