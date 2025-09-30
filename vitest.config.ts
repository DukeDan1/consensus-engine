import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)), // adjust if your alias targets project root
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    reporters: process.env.CI ? ["junit", "default"] : ["default"],
    outputFile: process.env.CI ? { junit: "reports/junit.xml" } : undefined,
    globals: true,
    css: true,
    alias: {
      "@/": new URL("./", import.meta.url).pathname,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
