-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER');

-- CreateEnum
CREATE TYPE "PromptRetention" AS ENUM ('NONE', 'REDACTED_7D', 'REDACTED_30D');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "EndpointStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'UNHEALTHY');

-- CreateEnum
CREATE TYPE "RoutingMode" AS ENUM ('LOWEST_COST', 'BALANCED', 'QUALITY_FIRST', 'PREFERRED_PROVIDER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequestSource" AS ENUM ('API', 'PLAYGROUND', 'ARENA', 'BENCHMARK', 'SEED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT_PURCHASE', 'DEMO_CREDIT', 'USAGE_DEBIT', 'SELLER_EARNING', 'PAYOUT', 'PAYOUT_REVERSAL', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "balanceMicros" BIGINT NOT NULL DEFAULT 0,
    "heldMicros" BIGINT NOT NULL DEFAULT 0,
    "sellerBalanceMicros" BIGINT NOT NULL DEFAULT 0,
    "promptRetention" "PromptRetention" NOT NULL DEFAULT 'NONE',
    "requestLogRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'DEVELOPMENT',
    "routingPolicyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "spendLimitMicros" BIGINT,
    "spentMicros" BIGINT NOT NULL DEFAULT 0,
    "rpmLimit" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "rotatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "dataPolicyUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "description" TEXT,
    "family" TEXT,
    "contextWindow" INTEGER,
    "maxOutputTokens" INTEGER,
    "inputModalities" TEXT[],
    "outputModalities" TEXT[],
    "apiSupported" BOOLEAN NOT NULL DEFAULT true,
    "baselineInputPrice" INTEGER,
    "baselineOutputPrice" INTEGER,
    "baselinePriceSource" TEXT,
    "baselinePriceIsDemo" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "aliases" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCapability" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'declared',
    "source" TEXT,

    CONSTRAINT "ModelCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerEndpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "status" "EndpointStatus" NOT NULL DEFAULT 'PENDING',
    "statusMessage" TEXT,
    "discoveredModels" TEXT[],
    "config" JSONB,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "hint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "sellerOrgId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "upstreamModel" TEXT NOT NULL,
    "inputPrice" INTEGER NOT NULL,
    "outputPrice" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "unhealthyUntil" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "verifiedCapabilities" TEXT[],
    "validatedAt" TIMESTAMP(3),
    "validationError" TEXT,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 8,
    "rpmLimit" INTEGER NOT NULL DEFAULT 120,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "dailySpendCapMicros" BIGINT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferHealthCheck" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "statusCode" INTEGER,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferPriceHistory" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputPrice" INTEGER NOT NULL,
    "outputPrice" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "RoutingMode" NOT NULL DEFAULT 'LOWEST_COST',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "maxInputPrice" INTEGER,
    "maxOutputPrice" INTEGER,
    "minDiscountPct" INTEGER,
    "maxLatencyMs" INTEGER,
    "minReliability" INTEGER,
    "minQualityScore" DOUBLE PRECISION,
    "allowedProviders" TEXT[],
    "blockedProviders" TEXT[],
    "preferredSellers" TEXT[],
    "allowDemoOffers" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "weightPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "weightLatency" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "weightQuality" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "weightReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "userId" TEXT,
    "projectId" TEXT,
    "requestedModel" TEXT NOT NULL,
    "modelId" TEXT,
    "offerId" TEXT,
    "sellerOrgId" TEXT,
    "routingMode" "RoutingMode",
    "routingTrace" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "httpStatus" INTEGER,
    "stream" BOOLEAN NOT NULL DEFAULT false,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "usageEstimated" BOOLEAN NOT NULL DEFAULT false,
    "holdMicros" BIGINT NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "baselineCostMicros" BIGINT,
    "sellerEarningMicros" BIGINT NOT NULL DEFAULT 0,
    "platformFeeMicros" BIGINT NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "ttftMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "taskId" TEXT,
    "source" "RequestSource" NOT NULL DEFAULT 'API',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "payloadExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "InferenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestAttempt" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "errorCode" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "modelId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "keyScope" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "baselineCostMicros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "account" "LedgerAccount" NOT NULL DEFAULT 'BUYER',
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "amountMicros" BIGINT NOT NULL,
    "balanceAfterMicros" BIGINT,
    "requestId" TEXT,
    "paymentRef" TEXT,
    "payoutId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "dailyLimitMicros" BIGINT,
    "monthlyLimitMicros" BIGINT,
    "maxPerRequestMicros" BIGINT,
    "maxPerTaskMicros" BIGINT,
    "alertThresholds" INTEGER[] DEFAULT ARRAY[50, 80, 100]::INTEGER[],
    "hardLimit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "destination" TEXT,
    "externalRef" TEXT,
    "note" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "secretCiphertext" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretAuthTag" TEXT NOT NULL,
    "secretWrappedKey" TEXT NOT NULL,
    "secretKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "offerId" TEXT,
    "runByOrgId" TEXT,
    "benchmark" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "datasetDescription" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreUnit" TEXT NOT NULL,
    "costMicros" BIGINT NOT NULL,
    "avgLatencyMs" INTEGER NOT NULL,
    "limitations" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "promptChars" INTEGER NOT NULL,
    "criteria" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "rating" INTEGER,
    "scores" JSONB,
    "notes" TEXT,

    CONSTRAINT "ArenaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","modelId")
);

-- CreateTable
CREATE TABLE "SavedComparison" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_orgId_name_key" ON "Project"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_idx" ON "ApiKey"("orgId");

-- CreateIndex
CREATE INDEX "Model_providerId_idx" ON "Model"("providerId");

-- CreateIndex
CREATE INDEX "ModelCapability_capability_idx" ON "ModelCapability"("capability");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCapability_modelId_capability_key" ON "ModelCapability"("modelId", "capability");

-- CreateIndex
CREATE INDEX "SellerEndpoint_orgId_idx" ON "SellerEndpoint"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_endpointId_key" ON "ProviderCredential"("endpointId");

-- CreateIndex
CREATE INDEX "Offer_modelId_status_idx" ON "Offer"("modelId", "status");

-- CreateIndex
CREATE INDEX "Offer_sellerOrgId_idx" ON "Offer"("sellerOrgId");

-- CreateIndex
CREATE INDEX "OfferHealthCheck_offerId_checkedAt_idx" ON "OfferHealthCheck"("offerId", "checkedAt");

-- CreateIndex
CREATE INDEX "OfferPriceHistory_modelId_recordedAt_idx" ON "OfferPriceHistory"("modelId", "recordedAt");

-- CreateIndex
CREATE INDEX "RoutingPolicy_orgId_idx" ON "RoutingPolicy"("orgId");

-- CreateIndex
CREATE INDEX "InferenceRequest_orgId_createdAt_idx" ON "InferenceRequest"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "InferenceRequest_apiKeyId_createdAt_idx" ON "InferenceRequest"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "InferenceRequest_offerId_createdAt_idx" ON "InferenceRequest"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX "InferenceRequest_sellerOrgId_createdAt_idx" ON "InferenceRequest"("sellerOrgId", "createdAt");

-- CreateIndex
CREATE INDEX "InferenceRequest_orgId_taskId_idx" ON "InferenceRequest"("orgId", "taskId");

-- CreateIndex
CREATE INDEX "InferenceRequest_createdAt_idx" ON "InferenceRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InferenceRequest_orgId_idempotencyKey_key" ON "InferenceRequest"("orgId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RequestAttempt_offerId_createdAt_idx" ON "RequestAttempt"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestAttempt_requestId_idx" ON "RequestAttempt"("requestId");

-- CreateIndex
CREATE INDEX "UsageRecord_orgId_day_idx" ON "UsageRecord"("orgId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_orgId_keyScope_modelId_day_key" ON "UsageRecord"("orgId", "keyScope", "modelId", "day");

-- CreateIndex
CREATE INDEX "BillingTransaction_orgId_createdAt_idx" ON "BillingTransaction"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_type_requestId_key" ON "BillingTransaction"("type", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_type_paymentRef_key" ON "BillingTransaction"("type", "paymentRef");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_scopeKey_key" ON "Budget"("scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlert_budgetId_period_threshold_key" ON "BudgetAlert"("budgetId", "period", "threshold");

-- CreateIndex
CREATE INDEX "Payout_orgId_createdAt_idx" ON "Payout"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_orgId_idx" ON "WebhookEndpoint"("orgId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_orgId_createdAt_idx" ON "Notification"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkResult_modelId_benchmark_idx" ON "BenchmarkResult"("modelId", "benchmark");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaEntry_requestId_key" ON "ArenaEntry"("requestId");

-- CreateIndex
CREATE INDEX "SavedComparison_userId_idx" ON "SavedComparison"("userId");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_routingPolicyId_fkey" FOREIGN KEY ("routingPolicyId") REFERENCES "RoutingPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Model" ADD CONSTRAINT "Model_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCapability" ADD CONSTRAINT "ModelCapability_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerEndpoint" ADD CONSTRAINT "SellerEndpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "SellerEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "SellerEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferHealthCheck" ADD CONSTRAINT "OfferHealthCheck_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPriceHistory" ADD CONSTRAINT "OfferPriceHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingPolicy" ADD CONSTRAINT "RoutingPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAttempt" ADD CONSTRAINT "RequestAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InferenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAttempt" ADD CONSTRAINT "RequestAttempt_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_runByOrgId_fkey" FOREIGN KEY ("runByOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaSession" ADD CONSTRAINT "ArenaSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaSession" ADD CONSTRAINT "ArenaSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaEntry" ADD CONSTRAINT "ArenaEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ArenaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaEntry" ADD CONSTRAINT "ArenaEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InferenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedComparison" ADD CONSTRAINT "SavedComparison_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
