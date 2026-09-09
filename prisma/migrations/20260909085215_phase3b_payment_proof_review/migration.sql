-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_REJECTED';

-- DropIndex
DROP INDEX "PaymentProofRequest_seeakkPaymentId_key";

-- AlterTable
ALTER TABLE "PaymentProofRequest" ADD COLUMN     "environment" "Environment" NOT NULL DEFAULT 'TEST',
ADD COLUMN     "paymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "rawPayload" JSONB,
ADD COLUMN     "remoteStatus" TEXT,
ADD COLUMN     "requestedMonths" INTEGER,
ADD COLUMN     "requestedUsers" INTEGER,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "unitPrice" DOUBLE PRECISION,
ALTER COLUMN "proofFileKey" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PaymentProofRequest_environment_idx" ON "PaymentProofRequest"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProofRequest_seeakkPaymentId_environment_key" ON "PaymentProofRequest"("seeakkPaymentId", "environment");
