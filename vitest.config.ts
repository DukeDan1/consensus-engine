import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    reporters: process.env.CI ? ["junit", "default"] : ["default"],
    outputFile: process.env.CI ? { junit: "reports/junit.xml" } : undefined,
    globals: true,
    css: true,
    alias: {
      "@/": new URL("./", import.meta.url).pathname, // matches your tsconfig paths
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"], // lcov + summary for PR tools
      reportsDirectory: "coverage",
    },
  },
});
