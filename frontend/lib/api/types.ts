// DTOs used by lib/api. Real contract types are re-exported from @hustl/contracts;
// domains whose contract file is still a stub get a minimal local type marked
// TODO(contract) — replace with the contract import once the owning service lands it.
import type { DealStatus, MilestoneStatus, Niche, PaymentMode, Role, SocialPlatform } from "@hustl/contracts"

export type {
  AdminUserListItem,
  AdminUsersQuery,
  AdminUserStatusRequest,
  AdminVerificationItem,
  AdminVerificationsQuery,
  AuthSession,
  BrandPublicProfile,
  ChooseRoleRequest,
  ChooseRoleResponse,
  ConversationSummary,
  CreateVerificationRequest,
  CreatorPublicProfile,
  CursorMeta,
  DealStatus,
  GoogleAuthResponse,
  ListConversationsQuery,
  ListMessagesQuery,
  ListNotificationsQuery,
  LoginRequest,
  LogoutResponse,
  MarkNotificationsReadRequest,
  MeResponse,
  MessageDTO,
  MilestoneStatus,
  NotificationDTO,
  OwnBrandProfile,
  OwnCreatorProfile,
  PageMeta,
  PaymentMode,
  PublicUser,
  RegisterRequest,
  Role,
  SavedCreatorItem,
  SavedCreatorState,
  SendMessageRequest,
  SocialPlatform,
  UnreadCounts,
  UpdateBrandProfileRequest,
  UpdateCreatorProfileRequest,
  UpdateMeRequest,
  VerificationDecisionRequest,
  VerificationRequestDto,
} from "@hustl/contracts"

/** `{ count }` from GET /notifications/unread-count and /conversations/unread-count. */
export type UnreadCount = { count: number }
export type MarkNotificationsReadResponse = { updated: number; unreadCount: number }

type Iso = string
type Json = Record<string, unknown>

// ─── Briefs ── TODO(contract): replace with packages/contracts/src/briefs.ts ───

export type BriefStatus = "DRAFT" | "PUBLISHED" | "CLOSED"
export type BriefDeliverable = { type: string; platform?: SocialPlatform; quantity: number; notes?: string }

export type Brief = {
  id: string
  brandId: string
  title: string
  description: string
  status: BriefStatus
  niche: Niche | string | null
  platforms: SocialPlatform[]
  deliverables: BriefDeliverable[]
  budgetPerCreator: number | null
  creatorsNeeded: number
  minFollowers: number | null
  location: string | null
  deadline: Iso | null
  timeline: string | null
  publishedAt: Iso | null
  createdAt: Iso
  updatedAt: Iso
  brand?: { id: string; slug: string; companyName: string; logoUrl: string | null; verified: boolean }
  applicationsCount?: number
}
export type BriefInput = Partial<Omit<Brief, "id" | "brandId" | "status" | "publishedAt" | "createdAt" | "updatedAt" | "brand" | "applicationsCount">> & { title: string }
export type OpenBriefsQuery = { niche?: string; platform?: SocialPlatform; minBudget?: number; q?: string; page?: number; pageSize?: number }
export type ParsedBrief = { fields: Partial<BriefInput>; confidence: Record<string, number>; source: string }
export type BriefMatch = {
  creatorId: string
  matchScore: number
  matchReasons: string[]
  disqualifiers: string[]
  components?: Json
  creator: { id: string; handle: string; name: string; avatarUrl: string | null; headline: string; niches: string[]; followersTotal: number; engagementRate: number | null; verified: boolean }
}
export type BriefFit = { matchScore: number; matchReasons: string[]; disqualifiers: string[] }

// ─── Applications ── TODO(contract) ───────────────────────────────────────────

export type ApplicationStatus = "APPLIED" | "SHORTLISTED" | "OFFERED" | "REJECTED" | "WITHDRAWN"
export type Application = {
  id: string
  briefId: string
  creatorId: string
  pitch: string
  proposedRate: number
  status: ApplicationStatus
  matchScore: number | null
  matchReasons: string[]
  createdAt: Iso
  brief?: Pick<Brief, "id" | "title" | "status" | "budgetPerCreator"> & { brand?: Brief["brand"] }
  creator?: BriefMatch["creator"]
}
export type CreateApplicationRequest = { pitch: string; proposedRate: number }

// ─── Deals & offers ── TODO(contract): replace with packages/contracts/src/deals.ts ─

export type MilestoneInput = { title: string; amount: number; dueDate?: Iso; description?: string }
export type Milestone = MilestoneInput & {
  id: string
  dealId: string
  status: MilestoneStatus
  position: number
  submission: { url: string | null; mediaAssetId: string | null; note: string; submittedAt: Iso } | null
  approvedAt: Iso | null
  releasedAt: Iso | null
}
export type Offer = {
  id: string
  dealId: string
  round: number
  fromRole: Extract<Role, "BRAND" | "CREATOR">
  amount: number
  paymentMode: PaymentMode
  milestones: MilestoneInput[]
  deliverables: string
  dueDate: Iso | null
  message: string | null
  createdAt: Iso
}
export type DealParty = { id: string; userId: string; name: string; avatarUrl: string | null; handle?: string; slug?: string }
export type Deal = {
  id: string
  title: string
  status: DealStatus
  amount: number
  currency: string
  paymentMode: PaymentMode
  briefId: string | null
  applicationId: string | null
  brand: DealParty
  creator: DealParty
  awaitingParty: "BRAND" | "CREATOR" | null
  counterRounds: number
  dueDate: Iso | null
  createdAt: Iso
  updatedAt: Iso
}
export type DealContract = { id: string; dealId: string; terms: Json; brandSignedAt: Iso | null; creatorSignedAt: Iso | null; pdfMediaId: string | null }
export type DealEvent = { id: string; type: string; actorRole: string; payload: Json; createdAt: Iso }
export type DealDetail = Deal & { offers: Offer[]; milestones: Milestone[]; contract: DealContract | null; events: DealEvent[] }
export type CreateOfferRequest = {
  creatorId: string
  briefId?: string
  applicationId?: string
  title: string
  amount: number
  paymentMode: PaymentMode
  milestones: MilestoneInput[]
  deliverables: string
  dueDate?: Iso
  message?: string
}
export type CounterOfferRequest = Partial<Pick<CreateOfferRequest, "amount" | "paymentMode" | "milestones" | "deliverables" | "dueDate">> & { message?: string }
export type DealsQuery = { role?: "BRAND" | "CREATOR"; status?: DealStatus | DealStatus[]; page?: number; pageSize?: number }
export type DealAction = "accept" | "decline" | "cancel" | "counter" | "sign" | "complete"
export type SubmitMilestoneRequest = { url?: string; mediaAssetId?: string; note: string }
export type OpenDisputeRequest = { reason: string; milestoneId?: string; evidenceIds?: string[] }
export type CreateReviewRequest = { rating: number; comment: string }

// ─── Payments ── TODO(contract): replace with packages/contracts/src/payments.ts ─

export type PaymentProvider = "stripe" | "razorpay" | "test"
export type PaymentIntent = { id: string; dealId: string; provider: PaymentProvider; amount: number; fees: Json; status: string; createdAt: Iso }
export type CheckoutSession = { provider: PaymentProvider; clientSecret?: string; orderId?: string; publishableKey?: string; keyId?: string }
export type CreateIntentResponse = { intent: PaymentIntent; checkout: CheckoutSession }
export type LedgerEntry = { id: string; dealId: string; type: string; amount: number; currency: string; createdAt: Iso; milestoneId?: string | null }
export type Payout = { id: string; dealId: string; milestoneId: string | null; amount: number; fee: number; status: string; createdAt: Iso; paidAt: Iso | null }
export type DealEscrowSummary = { dealId: string; funded: number; held: number; released: number; refunded: number; frozen: boolean; ledger: LedgerEntry[]; payouts: Payout[] }
export type PaymentsSummary = Json
export type PayoutAccount = { accountId: string | null; provider: PaymentProvider | null; status: "NONE" | "PENDING" | "ACTIVE" | "RESTRICTED"; detailsSubmitted: boolean }
export type PayoutOnboardingLink = { url: string | null; status: string }
export type Dispute = { id: string; dealId: string; milestoneId: string | null; reason: string; status: string; createdAt: Iso; resolvedAt: Iso | null }
export type ResolveDisputeRequest = { resolution: "RELEASE" | "REFUND" | "SPLIT"; splitCreatorPercent?: number; note: string }

// ─── Social ── TODO(contract): replace with packages/contracts/src/social.ts ────

export type SocialProviders = { phyllo: { configured: boolean; missingEnv: string[] } }
export type PhylloSdkToken = { userId: string; sdkToken: string; expiresAt: Iso }
export type SocialAccount = {
  id: string
  creatorId: string
  platform: SocialPlatform
  source: "PHYLLO" | "SELF_REPORTED"
  verified: boolean
  status: "PENDING" | "CONNECTED" | "ERROR" | "DISCONNECTED"
  handle: string
  profileUrl: string | null
  followers: number | null
  engagementRate: number | null
  avgViews: number | null
  lastSyncedAt: Iso | null
}
export type SelfReportedAccountRequest = { platform: SocialPlatform; handle: string; followers: number; engagementRate: number; avgViews: number }
export type CreatorMetrics = Json
export type CreatorDemographics = Json
export type FraudFlag = { id: string; creatorId: string; type: string; severity: string; status: "OPEN" | "CLEARED" | "CONFIRMED"; createdAt: Iso }
export type ReviewFraudFlagRequest = { status: "CLEARED" | "CONFIRMED"; note: string }

// ─── Search ── TODO(contract): replace with packages/contracts/src/search.ts ────

export type SearchCreatorsQuery = {
  q?: string
  niche?: string
  platform?: SocialPlatform
  minFollowers?: number
  maxFollowers?: number
  minEngagement?: number
  location?: string
  verified?: boolean
  available?: boolean
  sort?: string
  page?: number
}
export type SearchBriefsQuery = { q?: string; niche?: string; platform?: SocialPlatform; minBudget?: number; sort?: string; page?: number }
export type SearchMeta = PageMetaLike & { engine?: "elasticsearch" | "postgres" }
type PageMetaLike = { page?: number; pageSize?: number; total?: number; totalPages?: number }

// ─── Analytics ── TODO(contract): replace with packages/contracts/src/analytics.ts ─

export type DateRangeQuery = { from?: string; to?: string }
export type BrandOverview = Json
export type BrandCampaignStats = { briefId: string; title: string; applications: number; shortlisted: number; deals: number; spend: number }
export type CreatorOverview = Json
export type DealAnalytics = Json
export type AdminMetrics = Json

// ─── Media ── TODO(contract): replace with packages/contracts/src/media.ts ───────

export type MediaKind = "DELIVERABLE" | "AVATAR" | "LOGO" | "VERIFICATION_DOC" | "ATTACHMENT" | "PORTFOLIO"
export type MediaAsset = { id: string; kind: MediaKind; fileName: string; mimeType: string; sizeBytes: number; status: "PENDING" | "READY"; dealId: string | null; createdAt: Iso }
export type CreateUploadRequest = { kind: MediaKind; fileName: string; mimeType: string; sizeBytes: number; dealId?: string }
export type CreateUploadResponse = { asset: MediaAsset; upload: { method: "PUT" | "POST"; url: string; headers: Record<string, string> } }
export type MediaDownload = { asset: MediaAsset; url: string; expiresAt: Iso }
