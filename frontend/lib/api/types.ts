// DTOs used by lib/api. Real contract types are re-exported from @hustl/contracts;
// domains whose contract file is still a stub get a minimal local type marked
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

// ─── Response DTOs ───────────────────────────────────────────────────────────
// Aliases of the shared contracts in backend/packages/contracts, kept under the
// names the API modules use. The contract is the single source of truth; these
// names exist so call sites read naturally (`Brief`, not `BriefDTO`).

export type {
  ApplicationDTO as Application,
  ApplicationScoreResult as BriefFit,
  ApplyMeta,
  BriefDTO as Brief,
  BriefMatchDTO as BriefMatch,
  ApplicationStatus,
  BriefStatus,
  CreateApplicationRequest,
  CreateBriefRequest as BriefInput,
  PublishBriefMeta,
  UpdateBriefRequest as BriefUpdate,
} from "@hustl/contracts"

export type {
  ContractDTO as DealContract,
  CounterOfferRequest,
  CreateDisputeRequest as OpenDisputeRequest,
  CreateOfferRequest,
  CreateReviewRequest,
  DealDetail,
  DealEventDTO as DealEvent,
  DealOfferDTO as Offer,
  DealSummary as Deal,
  DealUiAction,
  MilestoneDTO as Milestone,
  MilestoneInput,
  MilestoneUiAction,
  SubmitMilestoneRequest,
} from "@hustl/contracts"

export type {
  CheckoutDetails as CheckoutSession,
  CreateFundingIntentResponse as CreateIntentResponse,
  DealPaymentsResponse as DealEscrowSummary,
  DisputeDTO as Dispute,
  EscrowSummary,
  LedgerEntryDTO as LedgerEntry,
  OnboardingLinkResponse as PayoutOnboardingLink,
  PaymentIntentDTO as PaymentIntent,
  PaymentProviderName as PaymentProvider,
  PaymentSummary as PaymentsSummary,
  PayoutAccountDTO as PayoutAccount,
  PayoutDTO as Payout,
  ResolveDisputeRequest,
} from "@hustl/contracts"

export type {
  CreatorDemographics,
  CreatorMetrics,
  FraudFlagDto as FraudFlag,
  FraudFlagReviewInput as ReviewFraudFlagRequest,
  PhylloSdkToken,
  SelfReportedAccountInput as SelfReportedAccountRequest,
  SocialAccountDto as SocialAccount,
  SocialProvidersStatus as SocialProviders,
  SocialSyncResult,
} from "@hustl/contracts"

export type { BriefSearchResult, CreatorSearchResult, SearchMeta } from "@hustl/contracts"

export type {
  AdminMetrics,
  AnalyticsRangeQuery as DateRangeQuery,
  BrandOverview,
  CampaignAnalytics as BrandCampaignStats,
  CreatorOverview,
  DealAnalytics,
  DealReport,
} from "@hustl/contracts"

export type {
  CreateUploadRequest,
  CreateUploadResponse,
  MediaAssetDto as MediaAsset,
  MediaAssetWithDownload as MediaDownload,
  MediaKind,
} from "@hustl/contracts"

// ─── Request shapes the client builds ────────────────────────────────────────
// Query strings are typed here rather than reused from the zod schemas, whose
// inferred types describe the parsed server-side value, not what a client sends.

export type OpenBriefsQuery = { niche?: string; platform?: SocialPlatform; minBudget?: number; q?: string; sort?: "newest" | "budget" | "deadline"; page?: number; pageSize?: number }
export type DealsQuery = { role?: "brand" | "creator"; status?: DealStatus | DealStatus[]; page?: number; pageSize?: number }
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
  pageSize?: number
}
export type SearchBriefsQuery = { q?: string; niche?: string; platform?: SocialPlatform; minBudget?: number; sort?: string; page?: number; pageSize?: number }

/** `PATCH /deals/:id/status` — the REST alias from the architecture doc. */
export type DealAction = "ACCEPT" | "DECLINE" | "CANCEL" | "COUNTER" | "SIGN"

/** `POST /briefs/parse` returns the AI parser's structured fields plus its confidence per field. */
export type ParsedBrief = { source: "claude" | "rules"; confidence: Record<string, "high" | "medium" | "low">; [field: string]: unknown }
