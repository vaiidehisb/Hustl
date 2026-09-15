import { defineConfig } from "tsup"

// Workspace packages (@hustl/*) are TypeScript sources and get bundled; every
// other bare import stays external and resolves from node_modules at runtime
// (pino transports, Prisma's generated client and native deps need that).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  noExternal: [/^@hustl\//],
  external: [/^(?!@hustl\/)[^./]/],
})
