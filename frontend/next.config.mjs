import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const appRoot = path.dirname(fileURLToPath(import.meta.url))
// Shared zod schemas + DTO types, compiled from source (outside the app root).
const contractsEntry = path.resolve(appRoot, "../backend/packages/contracts/src/index.ts")
const zodDir = path.dirname(require.resolve("zod/package.json"))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the contracts are included in the standalone bundle.
  outputFileTracingRoot: path.resolve(appRoot, ".."),
  experimental: {
    externalDir: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@hustl/contracts$": contractsEntry,
      // The contracts import "zod"; always use the frontend's single copy.
      zod$: zodDir,
    }
    return config
  },
}

export default nextConfig
