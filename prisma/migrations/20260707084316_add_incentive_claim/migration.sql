-- CreateEnum
CREATE TYPE "IncentiveType" AS ENUM ('rodtep', 'drawback', 'epcg_obligation');

-- CreateEnum
CREATE TYPE "IncentiveClaimStatus" AS ENUM ('claimable', 'claimed', 'received');

-- CreateTable
CREATE TABLE "IncentiveClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "IncentiveType" NOT NULL,
    "status" "IncentiveClaimStatus" NOT NULL DEFAULT 'claimable',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "claimedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncentiveClaim_tenantId_status_idx" ON "IncentiveClaim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IncentiveClaim_tenantId_orderId_idx" ON "IncentiveClaim"("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
