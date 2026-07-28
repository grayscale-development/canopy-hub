import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": path.resolve(rootDir, "tests/setup/server-only.ts"),
    },
  },
  test: {
    globals: false,
    setupFiles: ["tests/setup/vitest.setup.ts"],
    environment: "node",
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "app/**/*.{test,spec}.{ts,tsx}",
      "components/**/*.{test,spec}.{ts,tsx}",
      "lib/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      ".next",
      "tests/db/**",
      "tests/e2e/**",
      "supabase/functions/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      exclude: [
        ".next/**",
        "coverage/**",
        "node_modules/**",
        "tests/**",
        "supabase/functions/**",
        "**/*.config.*",
        "next-env.d.ts",
      ],
    },
  },
})
