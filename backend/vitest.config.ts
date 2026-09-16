import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["services/*/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    // DB-backed tests and bcrypt (cost 12) are slower than pure unit tests.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
