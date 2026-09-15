import Fastify, { type FastifyInstance } from "fastify"
import { authenticate, ok, pageMeta, parse, registerErrorHandler, requireInternal, requireRole } from "@hustl/common"
import { searchBriefsQuery, searchCreatorsQuery, type ReindexResult, type SearchMeta } from "@hustl/contracts"
import type { SearchEngine } from "./engines"

export function registerRoutes(engine: SearchEngine) {
  return async (app: FastifyInstance) => {
    app.get("/search/creators", { preHandler: requireRole("BRAND", "ADMIN") }, async (req) => {
      const q = parse(searchCreatorsQuery, req.query)
      const { items, total } = await engine.searchCreators(q)
      const meta: SearchMeta = { ...pageMeta(q, total), engine: engine.name }
      return ok(items, meta)
    })

    app.get("/search/briefs", { preHandler: authenticate }, async (req) => {
      const q = parse(searchBriefsQuery, req.query)
      const { items, total } = await engine.searchBriefs(q)
      const meta: SearchMeta = { ...pageMeta(q, total), engine: engine.name }
      return ok(items, meta)
    })

    app.post("/internal/search/reindex", { preHandler: requireInternal }, async () => {
      const r = await engine.reindexAll()
      const data: ReindexResult = { engine: engine.name, ...r }
      return ok(data)
    })
  }
}

/** App without listening — used by tests with `inject()`. */
export async function buildApp(engine: SearchEngine) {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRoutes(engine)(app)
  await app.ready()
  return app
}
