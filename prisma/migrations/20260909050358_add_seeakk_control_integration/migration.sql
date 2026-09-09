/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,environment]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppModuleKey" AS ENUM ('LEADS', 'DEALS', 'WHATSAPP', 'AUTOMATION', 'REPORTS', 'CAMPAIGNS', 'INTEGRATIONS');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('INBOUND_FROM_SEEAKK', 'OUTBOUND_TO_SEEAKK');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_PROOF_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_PROOF_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'MODULE_OVERRIDE_SET';
ALTER TYPE "AuditAction" ADD VALUE 'MODULE_OVERRIDE_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'SYNC_EVENT_TRIGGERED';

-- CreateTable
CREATE TABLE "PaymentProofRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "seeakkPaymentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billingCycle" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "transactionRef" TEXT,
    "proofFileKey" TEXT NOT NULL,
    "proofFileMime" TEXT,
    "notes" TEXT,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "approvedEntitlements" JSONB,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProofRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyModuleOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "moduleKey" "AppModuleKey" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyModuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSyncLog" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "eventType" TEXT NOT NULL,
    "workspaceId" TEXT,
    "companyId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "statusCode" INTEGER,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "errorMessage" TEXT,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProofRequest_seeakkPaymentId_key" ON "PaymentProofRequest"("seeakkPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProofRequest_invoiceId_key" ON "PaymentProofRequest"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentProofRequest_companyId_idx" ON "PaymentProofRequest"("companyId");

-- CreateIndex
CREATE INDEX "PaymentProofRequest_workspaceId_idx" ON "PaymentProofRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "PaymentProofRequest_status_idx" ON "PaymentProofRequest"("status");

-- CreateIndex
CREATE INDEX "PaymentProofRequest_createdAt_idx" ON "PaymentProofRequest"("createdAt");

-- CreateIndex
CREATE INDEX "CompanyModuleOverride_companyId_idx" ON "CompanyModuleOverride"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModuleOverride_companyId_moduleKey_key" ON "CompanyModuleOverride"("companyId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSyncLog_idempotencyKey_key" ON "SystemSyncLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SystemSyncLog_workspaceId_idx" ON "SystemSyncLog"("workspaceId");

-- CreateIndex
CREATE INDEX "SystemSyncLog_companyId_idx" ON "SystemSyncLog"("companyId");

-- CreateIndex
CREATE INDEX "SystemSyncLog_status_idx" ON "SystemSyncLog"("status");

-- CreateIndex
CREATE INDEX "SystemSyncLog_eventType_idx" ON "SystemSyncLog"("eventType");

-- CreateIndex
CREATE INDEX "SystemSyncLog_createdAt_idx" ON "SystemSyncLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_workspaceId_environment_key" ON "Company"("workspaceId", "environment");

-- AddForeignKey
ALTER TABLE "PaymentProofRequest" ADD CONSTRAINT "PaymentProofRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProofRequest" ADD CONSTRAINT "PaymentProofRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProofRequest" ADD CONSTRAINT "PaymentProofRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProofRequest" ADD CONSTRAINT "PaymentProofRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyModuleOverride" ADD CONSTRAINT "CompanyModuleOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyModuleOverride" ADD CONSTRAINT "CompanyModuleOverride_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSyncLog" ADD CONSTRAINT "SystemSyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
