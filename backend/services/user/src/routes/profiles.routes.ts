import type { FastifyInstance } from "fastify"
import { ok, optionalAuth, parse, requireRole } from "@hustl/common"
import { brandSlugParams, creatorHandleParams, pageQuery, savedCreatorParams, updateBrandProfileRequest, updateCreatorProfileRequest } from "@hustl/contracts"
import * as brands from "../services/brands.service"
import * as creators from "../services/creators.service"

export async function profileRoutes(app: FastifyInstance) {
  // Creators — static "/me" routes take precedence over "/:handle" in the router.
  app.get("/creators/me", { preHandler: requireRole("CREATOR") }, async (req) => ok(await creators.getOwnCreatorProfile(req.user!.id)))

  app.put("/creators/me", { preHandler: requireRole("CREATOR") }, async (req) =>
    ok(await creators.updateOwnCreatorProfile(req.user!.id, parse(updateCreatorProfileRequest, req.body))),
  )

  app.get("/creators/:handle", { preHandler: optionalAuth }, async (req) =>
    ok(await creators.getPublicCreatorProfile(parse(creatorHandleParams, req.params).handle, req.user)),
  )

  // Brands
  app.get("/brands/me", { preHandler: requireRole("BRAND") }, async (req) => ok(await brands.getOwnBrandProfile(req.user!.id)))

  app.put("/brands/me", { preHandler: requireRole("BRAND") }, async (req) =>
    ok(await brands.updateOwnBrandProfile(req.user!.id, parse(updateBrandProfileRequest, req.body))),
  )

  app.get("/brands/me/saved-creators", { preHandler: requireRole("BRAND") }, async (req) => {
    const { items, meta } = await brands.listSavedCreators(req.user!.id, parse(pageQuery, req.query))
    return ok(items, meta)
  })

  app.put("/brands/me/saved-creators/:creatorId", { preHandler: requireRole("BRAND") }, async (req) =>
    ok(await brands.saveCreator(req.user!.id, parse(savedCreatorParams, req.params).creatorId)),
  )

  app.delete("/brands/me/saved-creators/:creatorId", { preHandler: requireRole("BRAND") }, async (req) =>
    ok(await brands.unsaveCreator(req.user!.id, parse(savedCreatorParams, req.params).creatorId)),
  )

  app.get("/brands/:slug", async (req) => ok(await brands.getPublicBrandProfile(parse(brandSlugParams, req.params).slug)))
}
