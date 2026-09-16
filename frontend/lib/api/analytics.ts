import type { BrandCampaignStats, BrandOverview, CreatorOverview, DateRangeQuery, DealAnalytics } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const analyticsApi = (r: Requester) => ({
  /** GET /analytics/brand/overview?from&to */
  brandOverview: (query?: DateRangeQuery, o?: CallOptions) => r<BrandOverview>("/analytics/brand/overview", { ...o, query }),
  /** GET /analytics/brand/campaigns */
  brandCampaigns: (o?: CallOptions) => r<BrandCampaignStats[]>("/analytics/brand/campaigns", o),
  /** GET /analytics/creator/overview */
  creatorOverview: (o?: CallOptions) => r<CreatorOverview>("/analytics/creator/overview", o),
  /** GET /analytics/deals/:id (party-only) */
  deal: (id: string, o?: CallOptions) => r<DealAnalytics>(`/analytics/deals/${seg(id)}`, o),
  /** GET /analytics/deals/:id/report */
  dealReport: (id: string, o?: CallOptions) => r<DealAnalytics>(`/analytics/deals/${seg(id)}/report`, o),
})
