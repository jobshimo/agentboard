import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment for server/db/domain/events/feedback/mcp/cli/config
    environment: "node",
    environmentMatchGlobs: [
      // Web SPA tests run in jsdom
      ["src/web/**", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/__tests__/**", "src/web/**/*.test.tsx"],
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
