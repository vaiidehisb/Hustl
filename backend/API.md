# hustl. backend — service contracts

All client traffic: **Next.js (server) → API Gateway :4000 → service**. The browser never calls services or the AI backend directly.

## Conventions (every service)

- Fastify 5 via `createService()` from `@hustl/common` (health endpoint, error handler, logging, graceful shutdown).
- Envelope: success `{ success: true, data, meta? }` (use `ok()`), failure `{ success: false, error: { code, message, details? } }` (throw `AppError` / `errors.*`).
- Validate every body/query/params with zod schemas from `@hustl/contracts` (`parse()` → 422).
- Auth: `authenticate`, `optionalAuth`, `requireRole("BRAND")`, `requireInternal` (service-to-service, header `x-internal-token`). Services authorise ownership themselves — never trust ids from the client.
- Service-to-service calls: `serviceClient(name, serviceUrl("payment"))`. AI calls: `serviceClient("ai", process.env.AI_SERVICE_URL)` against `/ai/*`.
- State changes + their events in one Prisma transaction: `publish(tx, TOPICS.X, key, payload)`. Consumers: `subscribe("deal-service", [TOPICS.PAYMENT_FUNDED], handler)` — idempotent handlers.
- Routes under `/internal/*` are blocked by the gateway.
- Missing third-party credentials → `errors.integrationUnavailable("Stripe", ["STRIPE_SECRET_KEY"])` (HTTP 503). Never fabricate data.
- Contracts: put request schemas + response DTO types for your domain in `packages/contracts/src/<domain>.ts` and export from `index.ts`.
- Tests: vitest in `services/<name>/test/*.test.ts` using `app.inject()`; pure logic (state machine, fees, scoring) must have unit tests. DB tests use `TEST_DATABASE_URL`.

## Ports

| service | port | gateway prefixes |
|---|---|---|
| gateway | 4000 | — |
| user | 4001 | /auth /users /creators /brands /verifications /admin/users /admin/verifications |
| deal | 4002 | /briefs /applications /deals |
| payment | 4003 | /payments /admin/disputes /admin/billing |
| creator-data | 4004 | /social /admin/fraud-flags |
| search | 4005 | /search |
| notification | 4006 | /notifications /conversations /socket.io |
| analytics | 4007 | /analytics /admin/metrics |
| media | 4008 | /media |
| ai-backend | 8000 | not exposed |

## user-service (contracts: `auth.ts`, `profiles.ts`)

- `POST /auth/register` `{ email, password, name, role: BRAND|CREATOR, companyName? | handle? }` → `{ user, accessToken, refreshToken, accessTokenExpiresAt }`. Duplicate email → 409. Creates profile in same tx; emits `user.created`.
- `POST /auth/login` `{ email, password }` → same shape. Generic 401 on bad credentials; SUSPENDED → 403.
- `POST /auth/refresh` `{ refreshToken }` → rotated tokens (old token revoked; reuse of a revoked token revokes the family).
- `POST /auth/logout` `{ refreshToken }`.
- `POST /auth/google` `{ idToken }` → verifies with `GOOGLE_CLIENT_ID`; creates user without role if new.
- `GET /users/me` → `{ user, creator?, brand?, profileCompletion: { percent, missing[] } }`.
- `PATCH /users/me` `{ name?, image? }`; `POST /users/me/role` `{ role, companyName? | handle? }` (only when role is null).
- Consumes `subscription.*` and applies entitlements (see payment-service -> Entitlements). `GET /users/me` and the public profiles expose `plan`, and `badgeTier` / `badgeUntil` alongside (never merged into) `verified`.
- `GET /creators/:handle` public profile (+ scores, social summary, reviews); `PUT /creators/me` profile update (emits `creator.profile_updated`); `GET /creators/me`.
- `GET /brands/:slug` public (profile + `liveBriefs` so creators can apply from it); `PUT /brands/me` (emits `brand.profile_updated`); `GET /brands/me`.
- `GET /brands/me/saved-creators`, `PUT /brands/me/saved-creators/:creatorId`, `DELETE …`.
- `POST /verifications` `{ type, details, documentIds }`; `GET /verifications/me`.
- Admin: `GET /admin/users`, `PATCH /admin/users/:id/status`, `GET /admin/verifications`, `POST /admin/verifications/:id/decision` `{ approve, note }` (sets `verifiedAt` / `kycStatus`, emits `user.kyc_verified`).
- Internal: `GET /internal/users/:id`, `POST /internal/users/batch` `{ ids }`, `GET /internal/creators/:id`, `GET /internal/brands/:id`, `GET /internal/brands/by-user/:userId`, `GET /internal/creators/by-user/:userId`.

## deal-service (contracts: `briefs.ts`, `deals.ts`)

State machine (server-enforced, invalid → 409):
`OFFER_SENT → (counter) NEGOTIATING → … → AGREED → CONTRACT_SIGNED → FUNDED → IN_PROGRESS → COMPLETED`; `DISPUTED` from FUNDED/IN_PROGRESS; `CANCELLED` before funding. Max **2 counter rounds**. Milestones: `PENDING → SUBMITTED → (REVISION_REQUESTED → SUBMITTED)* → APPROVED → RELEASED`; `DISPUTED`/`REFUNDED` via disputes. Upfront mode only when creator reliability > 85 **and** brand KYC verified.

- Briefs: `POST /briefs`, `PATCH /briefs/:id`, `POST /briefs/:id/publish` (emits `brief.published`, triggers AI brief embedding), `POST /briefs/:id/close`, `GET /briefs/mine`, `GET /briefs/:id`, `DELETE /briefs/:id` (soft, drafts only).
- `POST /briefs/parse` `{ text }` → AI `/ai/parse-brief` (validated result incl. confidence).
- `GET /briefs/:id/matches` (brand owner) → AI `/ai/match` → creators joined with public profile data.
- Marketplace: `GET /briefs/open?niche&platform&minBudget&q&sort=newest|budget|deadline&page` (published only; creators see their own fit via `GET /briefs/:id/fit` → AI application scoring preview).
- Applications: `POST /briefs/:id/applications` `{ pitch, proposedRate }` (creator; scored via AI `/ai/applications/score`, synchronous for first 10 applications, async after), `GET /briefs/:id/applications` (brand owner), `GET /applications/mine`, `POST /applications/:id/withdraw`, `PATCH /applications/:id/status` `{ status: SHORTLISTED|REJECTED }`.
- Deals: `POST /deals` (brand offer `{ creatorId, briefId?, applicationId?, title, amount, paymentMode, milestones[], deliverables, dueDate?, message? }`), `GET /deals?role&status` (summaries carry `allowedActions`, `counterRoundsRemaining` and a `milestoneRollup` so lists never fetch each deal), `GET /deals/:id` (deal + offers + milestones + contract + events; party-only), `POST /deals/:id/counter`, `/accept`, `/decline`, `/cancel`, `GET /deals/:id/contract`, `POST /deals/:id/contract/sign` `{ signerName }`, `POST /deals/:id/milestones/:mid/submit` `{ url?, mediaAssetId?, note }`, `/approve` (→ payment release), `/request-revision` `{ note }`, `/retry-release` (brand; retries a payout that failed after approval), `POST /deals/:id/disputes` `{ reason, milestoneId?, evidenceIds? }` (→ payment freeze), `POST /deals/:id/reviews` `{ rating, comment }`.
- REST alias from the architecture doc: `PATCH /deals/:id/status` `{ action }`.
- Consumes: `payment.funded` (→ FUNDED → IN_PROGRESS), `milestone.payment_released` (→ RELEASED; COMPLETED when all settled), `dispute.resolved`.
- Internal: `GET /internal/deals/:id` (for payment/notification/analytics authorisation), `GET /internal/deals/:id/participants`.

## payment-service (contracts: `payments.ts`)

Provider adapters: `stripe` (PaymentIntents + Connect transfers + Subscriptions), `razorpay` (Orders + Route transfers + Subscriptions), `test` (explicit sandbox, rejected when `NODE_ENV=production`). Selected by `PAYMENTS_PROVIDER`.
Fees: brand 8% (STARTER) / 5% (GROWTH, ENTERPRISE) at funding; processing 2% pass-through; creator 5% per payout. The rates come from `PLAN_CATALOG` in `contracts/payments.ts` — `BRAND_FEE_RATES` is derived from it, so a plan's price and its discount can't drift apart.

- `POST /payments/deals/:dealId/intent` (brand; deal must be CONTRACT_SIGNED) → `{ intent, checkout: { provider, clientSecret | orderId, publishableKey | keyId } }`. Idempotent per deal.
- `POST /payments/intents/:id/confirm-test` (test provider only) — simulates the provider webhook through the same code path.
- `POST /payments/webhooks/stripe`, `POST /payments/webhooks/razorpay` — signature-verified, idempotent (`provider_webhook_events`).
- `GET /payments/deals/:dealId` → escrow summary + ledger + payouts (party-only).
- `GET /payments/me/ledger` (brand), `GET /payments/me/payouts` (creator), `GET /payments/me/summary`.
- `GET /payments/payout-account`, `POST /payments/payout-account/onboarding-link` (Stripe Connect / Razorpay linked account; 503 without creds).
- Internal: `POST /internal/payments/milestones/:milestoneId/release` (requires milestone APPROVED, escrow not frozen), `POST /internal/payments/deals/:dealId/freeze`, `POST /internal/payments/disputes` (create).
- Admin: `GET /admin/disputes`, `POST /admin/disputes/:id/resolve` `{ resolution, splitCreatorPercent?, note }` → release/refund, unfreeze, emits `dispute.resolved`.
- Emits: `payment.funded`, `milestone.payment_released`, `payment.refunded`, `payment.disputed`, `dispute.opened`, `dispute.resolved`, `subscription.activated`, `subscription.renewed`, `subscription.payment_failed`, `subscription.cancelled`, `subscription.expired`.

### Subscription billing (contracts: `payments.ts` -> `PLAN_CATALOG`)

`PLAN_CATALOG` is the one source of truth for what we sell — key, audience, price (whole INR), interval and what it unlocks. The server bills from it and the UI renders pricing from it.

| product | audience | price | interval | grants |
|---|---|---|---|---|
| `BRAND_GROWTH` | BRAND | ₹2,999 | month | `BrandProfile.plan = GROWTH` → 5% brand fee (down from 8%) + advanced analytics |
| `BRAND_ENTERPRISE` | BRAND | custom | month | `plan = ENTERPRISE` → 5% brand fee. **Not self-serve**: an admin grants it |
| `CREATOR_BADGE_STANDARD` | CREATOR | ₹999 | year | `CreatorProfile.badgeTier = STANDARD` + `badgeUntil` — paid placement badge |
| `CREATOR_BADGE_PRIORITY` | CREATOR | ₹1,999 | year | `badgeTier = PRIORITY` — badge + priority placement in discovery |

**The paid badge is not KYC.** `badgeTier`/`badgeUntil` is a paid placement badge; `verifiedAt` is the free, admin-reviewed identity check. Separate columns, separate DTO fields (`badgeTier` vs `verified`), and they must stay separate in copy.

- `GET /payments/billing/products` → `{ products: (PlanProduct & { owned, ownedSubscriptionId })[], audience, currency }` — the caller's own audience (admins see all).
- `GET /payments/billing/subscription` → `{ subscriptions[], invoices[], entitlements: { brandPlan, brandFeeRate, badgeTier, badgeUntil } }`.
- `POST /payments/billing/subscribe` `{ product }` (brand products need a BRAND caller, creator products a CREATOR, else 403) → `{ subscription, checkout, alreadyActive }`, mirroring the escrow intent shape. `checkout` is `{ provider: "STRIPE", subscriptionId, hostedUrl, clientSecret, publishableKey } | { provider: "RAZORPAY", subscriptionId, keyId, shortUrl, amount, currency } | { provider: "TEST", subscriptionId, clientSecret, confirmPath }`. Subscribing again while one is live → **409 CONFLICT** (details carry `subscriptionId` and `currentPeriodEnd`); an unfinished PENDING checkout is reused rather than opening a second one.
- `POST /payments/billing/subscriptions/:id/cancel` → cancels at period end: `cancelAtPeriodEnd = true`, access (and `entitled`) runs to `currentPeriodEnd`, response carries `accessUntil`. A subscription that never activated is closed immediately (CANCELLED).
- `POST /payments/billing/subscriptions/:id/confirm-test` — test provider only, refused when `NODE_ENV=production`; builds the provider event in-process and runs it through the same path as a webhook.
- Webhooks: subscription events arrive on the existing `/payments/webhooks/{stripe,razorpay}` endpoints, signature-verified and deduplicated in `provider_webhook_events` like every other provider event. Stripe: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated|deleted`. Razorpay: `subscription.activated|charged`, `subscription.halted|pending`, `subscription.cancelled|completed|expired`.
- Admin: `POST /admin/billing/subscriptions` `{ subscriberType, brandId | creatorId, product, priceAmount?, periodDays?, note? }` → 201. Grants Enterprise and comps; recorded as `provider: MANUAL` with `grantedById`, and supersedes a live subscription for the same product. `GET /admin/billing/subscriptions?status&product&subscriberType&page`.
- Status model: `PENDING → ACTIVE → (PAST_DUE on a failed charge) → EXPIRED`. `PAST_DUE` keeps access while the provider retries. A scheduled sweep (`SUBSCRIPTION_SWEEP_INTERVAL_MS`, default 15 min) marks anything past `currentPeriodEnd` `EXPIRED` and emits `subscription.expired`.
- Env: Stripe needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and one recurring price per product — `STRIPE_PRICE_BRAND_GROWTH`, `STRIPE_PRICE_CREATOR_BADGE_STANDARD`, `STRIPE_PRICE_CREATOR_BADGE_PRIORITY`. Razorpay needs `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `RAZORPAY_PLAN_BRAND_GROWTH`, `RAZORPAY_PLAN_CREATOR_BADGE_STANDARD`, `RAZORPAY_PLAN_CREATOR_BADGE_PRIORITY`. Missing any → `503 INTEGRATION_UNAVAILABLE` naming them, and nothing is written.

### Entitlements (who writes what)

payment-service owns money and the `subscriptions` / `subscription_invoices` tables. It **never** writes `brand_profiles` or `creator_profiles`. user-service consumes `subscription.*` and is the only writer of the entitlement columns:

| event | user-service does |
|---|---|
| `subscription.activated` / `.renewed` | sets `BrandProfile.plan` (GROWTH/ENTERPRISE) or `CreatorProfile.badgeTier` + `badgeUntil = currentPeriodEnd`, then emits `brand.profile_updated` / `creator.profile_updated` so search reindexes |
| `subscription.payment_failed` | nothing — access continues while the provider retries |
| `subscription.cancelled` | nothing — access runs to `currentPeriodEnd` |
| `subscription.expired` | brand back to `STARTER`; creator badge cleared (`badgeTier`/`badgeUntil` → null) |

Every payload carries `subscriptionId`, `subscriberType`, `brandId`/`creatorId`, `userId`, `product`, `productName`, `brandPlan`, `badgeTier`, `amount`, `currency`, `interval`, `status`, `currentPeriodStart`/`currentPeriodEnd` and `cancelAtPeriodEnd` — enough for notification-service to write its copy without another lookup. Handlers are idempotent.

**Existing deals keep their rate.** `brandFeeRate`, `creatorFeeRate` and `processingFeeRate` are snapshotted onto the deal from the brand's plan at offer time (`feeSnapshot(brand.plan)` in deal-service) and never re-read afterwards. Buying or losing Growth changes the fee on the **next** offer only; funding an in-flight deal still charges the rate the deal was created with.

## creator-data-service (contracts: `social.ts`)

- `GET /social/providers` → which integrations are configured (`phyllo: { configured, missingEnv[] }`).
- `POST /social/phyllo/sdk-token` → Phyllo user + SDK token for Phyllo Connect (503 without `PHYLLO_CLIENT_ID/SECRET`).
- `POST /social/phyllo/webhook` — account connected / profile & engagement updates.
- `GET /social/accounts/me`, `POST /social/accounts/self-reported` `{ platform, handle, followers, engagementRate, avgViews }` (stored with `source=SELF_REPORTED`, always labelled as unverified), `DELETE /social/accounts/:id`, `POST /social/accounts/me/sync` (Phyllo refresh).
- `GET /social/creators/:creatorId/metrics` (aggregate + snapshots), `/demographics`.
- Normalisation: follower totals, follower-weighted ER, 30-day growth from snapshots → updates creator aggregates, emits `creator.metrics_updated`.
- Scoring: on `creator.metrics_updated` / `creator.profile_updated` / `deal.completed` → AI `/ai/scores/refresh/:creatorId` + `/ai/fraud/analyze-creator/:creatorId` + `/ai/embeddings/creators/:creatorId`; persists `creator_scores`, `fraud_flags`; emits `fraud.flagged`. Scheduled 24h sync job.
- Admin: `GET /admin/fraud-flags?status`, `POST /admin/fraud-flags/:id/review` `{ status: CLEARED|CONFIRMED, note }` (no automatic bans).

## search-service (contracts: `search.ts`)

Elasticsearch indices `creators`, `briefs` when `ELASTICSEARCH_URL` is set; otherwise a PostgreSQL query engine with the same filters (response `meta.engine = "elasticsearch" | "postgres"`).
- `GET /search/creators?q&niche&platform&minFollowers&maxFollowers&minEngagement&location&verified&available&sort&page` (brand/admin). Results carry `badgeTier` (the paid badge, only while in date) as well as `verified` (KYC).
- Paid placement: in the default `relevance` sort, creators with an in-date badge rank above unbadged ones (PRIORITY, then STANDARD, then none), with the usual ordering inside each group — Elasticsearch sorts on the indexed `badgeRank`, the PostgreSQL engine pages the same three groups in order. A badge never bypasses a filter, and an explicitly chosen sort (`followers`, `engagement`, `trust`, `newest`) is never reordered by it.
- `GET /search/briefs?q&niche&platform&minBudget&sort&page` (authenticated).
- Internal: `POST /internal/search/reindex`. Consumes profile/metrics/score/brief events to keep indices fresh.

## notification-service (contracts: `messaging.ts`)

- Consumes all business topics → `notifications` rows (idempotent on event id) + optional email (SendGrid when `SENDGRID_API_KEY`) + Socket.io push `notification:new`.
- Conversations are created on `offer.sent` (deal) and when an application is shortlisted; participants = brand user + creator user.
- `GET /conversations?dealId=&cursor=` (with last message, unread count; `dealId` returns just that deal's thread), `GET /conversations/:id/messages?before`, `POST /conversations/:id/messages` `{ body, attachmentIds? }` (emits `message.sent`, pushes `message:new`), `POST /conversations/:id/read`, `GET /conversations/unread-count`.
- `GET /notifications?unread`, `POST /notifications/read` `{ ids? }`, `GET /notifications/unread-count`.
- Socket.io at `/socket.io` authenticated with the access token (`auth: { token }`); rooms `user:<id>`, `conversation:<id>`; Redis adapter when `REDIS_URL` is set.

## analytics-service (contracts: `analytics.ts`)

Computed from PostgreSQL (ClickHouse target for scale noted in docs).
- `GET /analytics/brand/overview?from&to` (spend, escrow held, deals by status, time-to-fund, monthly spend series), `GET /analytics/brand/campaigns` (per brief: applications, shortlisted, deals, spend), `GET /analytics/creator/overview` (earnings series, pending, win rate, on-time rate, rating, score history), `GET /analytics/deals/:id` (party-only), `GET /analytics/deals/:id/report`, `GET /admin/metrics` (GMV, revenue, take rate, active deals, users, disputes).

## media-service (contracts: `media.ts`)

`STORAGE_DRIVER=s3` (S3/R2 via `S3_*` env, presigned PUT/GET) or `local` (files on disk under `STORAGE_LOCAL_DIR`, uploaded through the service).
- `POST /media/uploads` `{ kind, fileName, mimeType, sizeBytes, dealId? }` → `{ asset, upload: { method, url, headers } }` (type/size allow-list per kind).
- `PUT /media/uploads/:id/content` (local driver only), `POST /media/uploads/:id/complete`.
- `GET /media/:id` (authorised → signed download URL), `DELETE /media/:id`.
- `POST /media/contracts/:dealId/pdf` (internal/party) renders the signed contract PDF; `GET /media/media-kit/:creatorId` renders a media kit PDF from real profile/metrics; `GET /media/reports/deals/:dealId`.

## ai-backend (FastAPI, internal only — header `x-internal-token`)

- `POST /ai/parse-brief` `{ text | fields }` → validated structured brief + per-field confidence (Claude when `ANTHROPIC_API_KEY`, else deterministic rule parser, `source` reported). Cached by content hash.
- `POST /ai/embeddings/creators/{creator_id}`, `POST /ai/embeddings/briefs/{brief_id}` → upsert vectors in `ai` schema.
- `POST /ai/match` `{ brief_id, limit? }` → `[{ creator_id, match_score, match_reasons[], disqualifiers[], components }]`.
- `POST /ai/scores/refresh/{creator_id}` → `{ trust_score, niche_authority, reliability_score, model_version, signals }`.
- `POST /ai/fraud/analyze-creator/{creator_id}`, `POST /ai/fraud/analyze-deal/{deal_id}` → `{ authenticity_score, risk_level, flags[] }`.
- `POST /ai/applications/score` `{ application_id }` or `{ creator_id, brief_id }` → `{ match_score, match_reasons[], disqualifiers[] }`.
- `GET /health` → model/vector backend status.
