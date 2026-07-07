-- CreateEnum
CREATE TYPE "ComplianceCategory" AS ENUM ('iec', 'ad_code', 'gst_lut', 'rcmc', 'fssai', 'cdsco', 'bis', 'buyer_cert', 'other');

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "ComplianceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "issuingAuthority" TEXT,
    "documentNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "renewalLeadDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceItem_tenantId_expiresAt_idx" ON "ComplianceItem"("tenantId", "expiresAt");

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
