-- CreateEnum
CREATE TYPE "SubscriberType" AS ENUM ('BRAND', 'CREATOR');

-- CreateEnum
CREATE TYPE "SubscriptionProduct" AS ENUM ('BRAND_GROWTH', 'BRAND_ENTERPRISE', 'CREATOR_BADGE_STANDARD', 'CREATOR_BADGE_PRIORITY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('STRIPE', 'RAZORPAY', 'TEST', 'MANUAL');

-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CreatorBadgeTier" AS ENUM ('STANDARD', 'PRIORITY');

-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN     "badge_tier" "CreatorBadgeTier",
ADD COLUMN     "badge_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "subscriber_type" "SubscriberType" NOT NULL,
    "brand_id" UUID,
    "creator_id" UUID,
    "product" "SubscriptionProduct" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "SubscriptionProvider" NOT NULL,
    "provider_subscription_id" TEXT,
    "provider_checkout_ref" TEXT,
    "price_amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "interval" "SubscriptionInterval" NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "granted_by_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "SubscriptionProvider" NOT NULL,
    "provider_invoice_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_brand_id_idx" ON "subscriptions"("brand_id");

-- CreateIndex
CREATE INDEX "subscriptions_creator_id_idx" ON "subscriptions"("creator_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_provider_subscription_id_key" ON "subscriptions"("provider", "provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscription_invoices_subscription_id_created_at_idx" ON "subscription_invoices"("subscription_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_provider_provider_invoice_id_key" ON "subscription_invoices"("provider", "provider_invoice_id");

-- CreateIndex
CREATE INDEX "creator_profiles_badge_tier_badge_until_idx" ON "creator_profiles"("badge_tier", "badge_until");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one subscriber per subscription, matching subscriber_type.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_ck" CHECK (
  (("subscriber_type" = 'BRAND') AND "brand_id" IS NOT NULL AND "creator_id" IS NULL)
  OR
  (("subscriber_type" = 'CREATOR') AND "creator_id" IS NOT NULL AND "brand_id" IS NULL)
);

-- At most one ACTIVE (or PENDING-renewal PAST_DUE) subscription per subscriber per product.
CREATE UNIQUE INDEX "subscriptions_active_unique"
  ON "subscriptions" (COALESCE("brand_id", "creator_id"), "product")
  WHERE "status" IN ('ACTIVE', 'PAST_DUE');
