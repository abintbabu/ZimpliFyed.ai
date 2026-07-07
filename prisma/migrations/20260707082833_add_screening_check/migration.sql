-- CreateEnum
CREATE TYPE "ScreeningResult" AS ENUM ('clear', 'potential_match', 'manual_attestation');

-- CreateTable
CREATE TABLE "ScreeningCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "country" TEXT,
    "result" "ScreeningResult" NOT NULL,
    "matches" JSONB,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "checkedByUserId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreeningCheck_tenantId_checkedAt_idx" ON "ScreeningCheck"("tenantId", "checkedAt");

-- AddForeignKey
ALTER TABLE "ScreeningCheck" ADD CONSTRAINT "ScreeningCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
