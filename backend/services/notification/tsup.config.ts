import { defineConfig } from "tsup"

// `noExternal` is config-only in tsup (the CLI has no such flag): bundle the
// workspace packages (they ship TypeScript sources) and keep Prisma's client external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  noExternal: ["@hustl/common", "@hustl/contracts", "@hustl/db"],
  external: ["@prisma/client"],
})
