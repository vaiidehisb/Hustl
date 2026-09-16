import { defineConfig } from "tsup"

// Workspace packages ship TypeScript sources, so they're bundled; Prisma's generated client and the
// provider SDKs stay external (resolved from node_modules at runtime).
// (tsup's CLI has no --noExternal flag, hence a config file.)
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  noExternal: [/^@hustl\//],
  external: ["@prisma/client", "stripe", "razorpay"],
})
