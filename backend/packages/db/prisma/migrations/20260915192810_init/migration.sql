-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BRAND', 'CREATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BrandPlan" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'LINKEDIN', 'X');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SocialDataSource" AS ENUM ('PHYLLO', 'SELF_REPORTED');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BriefVisibility" AS ENUM ('OPEN', 'DIRECT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'OFFERED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('COMPLETION', 'UPFRONT', 'MILESTONES');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OFFER_SENT', 'NEGOTIATING', 'AGREED', 'CONTRACT_SIGNED', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Party" AS ENUM ('BRAND', 'CREATOR');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'RELEASED', 'DISPUTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('UNFUNDED', 'FUNDING', 'FUNDED', 'PARTIALLY_RELEASED', 'RELEASED', 'REFUNDED', 'FROZEN');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'RAZORPAY', 'TEST');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('ESCROW_FUND', 'BRAND_FEE', 'PROCESSING_FEE', 'RELEASE', 'CREATOR_FEE', 'REFUND');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'ON_HOLD', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('RELEASE_TO_CREATOR', 'REFUND_TO_BRAND', 'SPLIT');

-- CreateEnum
CREATE TYPE "FraudSubject" AS ENUM ('CREATOR', 'DEAL');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FraudFlagStatus" AS ENUM ('OPEN', 'CLEARED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('CREATOR_IDENTITY', 'BRAND_BUSINESS');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('AVATAR', 'LOGO', 'PORTFOLIO', 'DELIVERABLE', 'CONTRACT_PDF', 'MEDIA_KIT', 'REPORT', 'DISPUTE_EVIDENCE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "image" TEXT,
    "role" "UserRole",
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'NONE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'IN',
    "avatar_url" TEXT,
    "niches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rate_card" JSONB NOT NULL DEFAULT '[]',
    "portfolio" JSONB NOT NULL DEFAULT '[]',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "verified_at" TIMESTAMP(3),
    "followers_total" INTEGER NOT NULL DEFAULT 0,
    "engagement_rate" DOUBLE PRECISION,
    "follower_growth_30d" DOUBLE PRECISION,
    "completed_deals" INTEGER NOT NULL DEFAULT 0,
    "cancelled_deals" INTEGER NOT NULL DEFAULT 0,
    "avg_rating" DOUBLE PRECISION,
    "on_time_rate" DOUBLE PRECISION,
    "revision_rate" DOUBLE PRECISION,
    "avg_response_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "website" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT,
    "plan" "BrandPlan" NOT NULL DEFAULT 'STARTER',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_creators" (
    "brand_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_creators_pkey" PRIMARY KEY ("brand_id","creator_id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "provider_ref" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "document_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewer_id" UUID,
    "reviewer_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "source" "SocialDataSource" NOT NULL,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'PENDING',
    "external_account_id" TEXT,
    "handle" TEXT NOT NULL,
    "profile_url" TEXT,
    "followers" INTEGER,
    "following" INTEGER,
    "posts_count" INTEGER,
    "avg_likes" DOUBLE PRECISION,
    "avg_comments" DOUBLE PRECISION,
    "avg_views" DOUBLE PRECISION,
    "engagement_rate" DOUBLE PRECISION,
    "audience_demographics" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_metric_snapshots" (
    "id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "followers" INTEGER NOT NULL,
    "engagement_rate" DOUBLE PRECISION,
    "avg_likes" DOUBLE PRECISION,
    "avg_comments" DOUBLE PRECISION,
    "avg_views" DOUBLE PRECISION,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_scores" (
    "creator_id" UUID NOT NULL,
    "trust_score" INTEGER NOT NULL,
    "niche_authority" INTEGER NOT NULL,
    "reliability_score" INTEGER NOT NULL,
    "authenticity_score" INTEGER,
    "model_version" TEXT NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_scores_pkey" PRIMARY KEY ("creator_id")
);

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" UUID NOT NULL,
    "subject" "FraudSubject" NOT NULL,
    "creator_id" UUID,
    "deal_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "source" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" "FraudFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewer_id" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefs" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL DEFAULT '',
    "niche" TEXT NOT NULL DEFAULT '',
    "platforms" "SocialPlatform"[] DEFAULT ARRAY[]::"SocialPlatform"[],
    "deliverables" JSONB NOT NULL DEFAULT '[]',
    "min_followers" INTEGER NOT NULL DEFAULT 0,
    "min_engagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "budget_per_creator" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "creators_needed" INTEGER NOT NULL DEFAULT 1,
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeline" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "visibility" "BriefVisibility" NOT NULL DEFAULT 'OPEN',
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "parsed" JSONB,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "brief_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "pitch" TEXT NOT NULL,
    "proposed_rate" INTEGER NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "match_score" INTEGER,
    "match_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disqualifiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score_model_version" TEXT,
    "scored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "brief_id" UUID,
    "application_id" UUID,
    "brand_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'OFFER_SENT',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_mode" "PaymentMode" NOT NULL,
    "deliverables" TEXT NOT NULL DEFAULT '',
    "due_date" TIMESTAMP(3),
    "awaiting_party" "Party",
    "negotiation_rounds" INTEGER NOT NULL DEFAULT 0,
    "brand_fee_rate" DOUBLE PRECISION NOT NULL,
    "creator_fee_rate" DOUBLE PRECISION NOT NULL,
    "processing_fee_rate" DOUBLE PRECISION NOT NULL,
    "hold_until" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_offers" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "proposed_by" "Party" NOT NULL,
    "proposed_by_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "milestones" JSONB NOT NULL,
    "deliverables" TEXT NOT NULL DEFAULT '',
    "due_date" TIMESTAMP(3),
    "note" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "terms" JSONB NOT NULL,
    "body_hash" TEXT NOT NULL,
    "brand_signed_at" TIMESTAMP(3),
    "brand_signer_name" TEXT,
    "brand_signer_ip" TEXT,
    "creator_signed_at" TIMESTAMP(3),
    "creator_signer_name" TEXT,
    "creator_signer_ip" TEXT,
    "pdf_media_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "revision_count" INTEGER NOT NULL DEFAULT 0,
    "revision_note" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "url" TEXT,
    "media_asset_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_events" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "from_status" "DealStatus",
    "to_status" "DealStatus",
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_accounts" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'UNFUNDED',
    "funded_amount" INTEGER NOT NULL DEFAULT 0,
    "released_amount" INTEGER NOT NULL DEFAULT 0,
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,
    "frozen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_intent_id" TEXT,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "escrow_amount" INTEGER NOT NULL,
    "brand_fee" INTEGER NOT NULL,
    "processing_fee" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "client_secret" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "milestone_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_account_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "details_submitted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "gross" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL,
    "provider_ref" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "milestone_id" UUID,
    "raised_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "DisputeResolution",
    "split_creator_percent" INTEGER,
    "admin_note" TEXT,
    "resolved_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "deal_id" UUID,
    "application_id" UUID,
    "subject" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "event_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "checksum" TEXT,
    "deal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_offsets" (
    "consumer" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "last_event_id" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_offsets_pkey" PRIMARY KEY ("consumer","topic")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_user_id_key" ON "creator_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_handle_key" ON "creator_profiles"("handle");

-- CreateIndex
CREATE INDEX "creator_profiles_available_idx" ON "creator_profiles"("available");

-- CreateIndex
CREATE INDEX "creator_profiles_followers_total_idx" ON "creator_profiles"("followers_total");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_user_id_key" ON "brand_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_slug_key" ON "brand_profiles"("slug");

-- CreateIndex
CREATE INDEX "verification_requests_status_idx" ON "verification_requests"("status");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_creator_id_platform_key" ON "social_accounts"("creator_id", "platform");

-- CreateIndex
CREATE INDEX "social_metric_snapshots_social_account_id_captured_at_idx" ON "social_metric_snapshots"("social_account_id", "captured_at");

-- CreateIndex
CREATE INDEX "fraud_flags_status_subject_idx" ON "fraud_flags"("status", "subject");

-- CreateIndex
CREATE INDEX "fraud_flags_creator_id_idx" ON "fraud_flags"("creator_id");

-- CreateIndex
CREATE INDEX "fraud_flags_deal_id_idx" ON "fraud_flags"("deal_id");

-- CreateIndex
CREATE INDEX "briefs_status_published_at_idx" ON "briefs"("status", "published_at");

-- CreateIndex
CREATE INDEX "briefs_brand_id_status_idx" ON "briefs"("brand_id", "status");

-- CreateIndex
CREATE INDEX "applications_creator_id_status_idx" ON "applications"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_brief_id_creator_id_key" ON "applications"("brief_id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_application_id_key" ON "deals"("application_id");

-- CreateIndex
CREATE INDEX "deals_brand_id_status_idx" ON "deals"("brand_id", "status");

-- CreateIndex
CREATE INDEX "deals_creator_id_status_idx" ON "deals"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deal_offers_deal_id_round_key" ON "deal_offers"("deal_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_deal_id_key" ON "contracts"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_deal_id_position_key" ON "milestones"("deal_id", "position");

-- CreateIndex
CREATE INDEX "deliverables_milestone_id_idx" ON "deliverables"("milestone_id");

-- CreateIndex
CREATE INDEX "deal_events_deal_id_created_at_idx" ON "deal_events"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_subject_user_id_idx" ON "reviews"("subject_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_deal_id_author_id_key" ON "reviews"("deal_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_accounts_deal_id_key" ON "escrow_accounts"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_intents_deal_id_idx" ON "payment_intents"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_provider_provider_intent_id_key" ON "payment_intents"("provider", "provider_intent_id");

-- CreateIndex
CREATE INDEX "ledger_entries_deal_id_created_at_idx" ON "ledger_entries"("deal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_creator_id_key" ON "payout_accounts"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_milestone_id_key" ON "payouts"("milestone_id");

-- CreateIndex
CREATE INDEX "payouts_creator_id_status_idx" ON "payouts"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_event_id_key" ON "provider_webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_deal_id_idx" ON "disputes"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_deal_id_key" ON "conversations"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_application_id_key" ON "conversations"("application_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_event_id_key" ON "notifications"("user_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_owner_id_kind_idx" ON "media_assets"("owner_id", "kind");

-- CreateIndex
CREATE INDEX "media_assets_deal_id_idx" ON "media_assets"("deal_id");

-- CreateIndex
CREATE INDEX "outbox_events_topic_id_idx" ON "outbox_events"("topic", "id");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_idx" ON "outbox_events"("published_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_creators" ADD CONSTRAINT "saved_creators_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_creators" ADD CONSTRAINT "saved_creators_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_metric_snapshots" ADD CONSTRAINT "social_metric_snapshots_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_scores" ADD CONSTRAINT "creator_scores_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_accounts" ADD CONSTRAINT "escrow_accounts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Integrity constraints Prisma can't express ─────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
ALTER TABLE "briefs" ADD CONSTRAINT briefs_budget_positive CHECK (budget_per_creator > 0);
ALTER TABLE "briefs" ADD CONSTRAINT briefs_creators_needed_positive CHECK (creators_needed >= 1);
ALTER TABLE "briefs" ADD CONSTRAINT briefs_min_followers_nonneg CHECK (min_followers >= 0);
ALTER TABLE "briefs" ADD CONSTRAINT briefs_min_engagement_range CHECK (min_engagement >= 0 AND min_engagement <= 1);
ALTER TABLE "applications" ADD CONSTRAINT applications_rate_positive CHECK (proposed_rate > 0);
ALTER TABLE "applications" ADD CONSTRAINT applications_score_range CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 100);
ALTER TABLE "deals" ADD CONSTRAINT deals_amount_positive CHECK (amount > 0);
ALTER TABLE "deals" ADD CONSTRAINT deals_negotiation_rounds_max CHECK (negotiation_rounds BETWEEN 0 AND 2);
ALTER TABLE "deals" ADD CONSTRAINT deals_fee_rates_range CHECK (brand_fee_rate BETWEEN 0 AND 1 AND creator_fee_rate BETWEEN 0 AND 1 AND processing_fee_rate BETWEEN 0 AND 1);
ALTER TABLE "deals" ADD CONSTRAINT deals_parties_distinct CHECK (brand_id <> creator_id);
ALTER TABLE "deal_offers" ADD CONSTRAINT deal_offers_round_range CHECK (round BETWEEN 0 AND 2);
ALTER TABLE "deal_offers" ADD CONSTRAINT deal_offers_amount_positive CHECK (amount > 0);
ALTER TABLE "milestones" ADD CONSTRAINT milestones_percent_range CHECK (percent > 0 AND percent <= 100);
ALTER TABLE "milestones" ADD CONSTRAINT milestones_amount_nonneg CHECK (amount >= 0);
ALTER TABLE "reviews" ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "escrow_accounts" ADD CONSTRAINT escrow_amounts_consistent CHECK (funded_amount >= 0 AND released_amount >= 0 AND refunded_amount >= 0 AND released_amount + refunded_amount <= funded_amount);
ALTER TABLE "payment_intents" ADD CONSTRAINT payment_intents_totals CHECK (total_amount = escrow_amount + brand_fee + processing_fee AND escrow_amount > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT ledger_amount_positive CHECK (amount > 0);
ALTER TABLE "payouts" ADD CONSTRAINT payouts_net_consistent CHECK (net = gross - fee AND fee >= 0 AND gross > 0);
ALTER TABLE "creator_scores" ADD CONSTRAINT creator_scores_range CHECK (trust_score BETWEEN 0 AND 100 AND niche_authority BETWEEN 0 AND 100 AND reliability_score BETWEEN 0 AND 100 AND (authenticity_score IS NULL OR authenticity_score BETWEEN 0 AND 100));
ALTER TABLE "creator_profiles" ADD CONSTRAINT creator_engagement_range CHECK (engagement_rate IS NULL OR (engagement_rate >= 0 AND engagement_rate <= 1));
ALTER TABLE "social_accounts" ADD CONSTRAINT social_metrics_nonneg CHECK ((followers IS NULL OR followers >= 0) AND (engagement_rate IS NULL OR (engagement_rate >= 0 AND engagement_rate <= 1)));
ALTER TABLE "disputes" ADD CONSTRAINT disputes_split_range CHECK (split_creator_percent IS NULL OR split_creator_percent BETWEEN 0 AND 100);
ALTER TABLE "fraud_flags" ADD CONSTRAINT fraud_flag_subject CHECK ((subject = 'CREATOR' AND creator_id IS NOT NULL) OR (subject = 'DEAL' AND deal_id IS NOT NULL));
ALTER TABLE "media_assets" ADD CONSTRAINT media_size_nonneg CHECK (size_bytes IS NULL OR size_bytes >= 0);
-- Only one open dispute per deal at a time
CREATE UNIQUE INDEX disputes_one_open_per_deal ON "disputes" (deal_id) WHERE status <> 'RESOLVED';
-- Only one pending offer per deal
CREATE UNIQUE INDEX deal_offers_one_pending ON "deal_offers" (deal_id) WHERE status = 'PENDING';
