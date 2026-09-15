import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@hustl\/contracts$/, replacement: path.resolve(root, "../backend/packages/contracts/src/index.ts") },
      // Contracts live outside the app: always resolve their zod to ours.
      { find: /^zod$/, replacement: path.resolve(root, "node_modules/zod") },
      { find: /^server-only$/, replacement: path.resolve(root, "test/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${root}/` },
    ],
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
  },
})
