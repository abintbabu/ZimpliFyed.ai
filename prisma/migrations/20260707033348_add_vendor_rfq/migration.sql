-- CreateEnum
CREATE TYPE "VendorRfqStatus" AS ENUM ('open', 'awarded', 'closed');

-- CreateTable
CREATE TABLE "VendorRfq" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "targetPrice" DOUBLE PRECISION,
    "dueDate" TIMESTAMP(3),
    "status" "VendorRfqStatus" NOT NULL DEFAULT 'open',
    "awardedQuoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRfqInvite" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorRfqInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRfqQuote" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "moqPieces" INTEGER,
    "leadTimeDays" INTEGER,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorRfqQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorRfq_awardedQuoteId_key" ON "VendorRfq"("awardedQuoteId");

-- CreateIndex
CREATE INDEX "VendorRfq_tenantId_status_idx" ON "VendorRfq"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VendorRfqInvite_rfqId_idx" ON "VendorRfqInvite"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRfqInvite_rfqId_vendorId_key" ON "VendorRfqInvite"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorRfqQuote_rfqId_idx" ON "VendorRfqQuote"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRfqQuote_rfqId_vendorId_key" ON "VendorRfqQuote"("rfqId", "vendorId");

-- AddForeignKey
ALTER TABLE "VendorRfq" ADD CONSTRAINT "VendorRfq_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRfq" ADD CONSTRAINT "VendorRfq_awardedQuoteId_fkey" FOREIGN KEY ("awardedQuoteId") REFERENCES "VendorRfqQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRfqInvite" ADD CONSTRAINT "VendorRfqInvite_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "VendorRfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRfqInvite" ADD CONSTRAINT "VendorRfqInvite_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRfqQuote" ADD CONSTRAINT "VendorRfqQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "VendorRfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRfqQuote" ADD CONSTRAINT "VendorRfqQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
