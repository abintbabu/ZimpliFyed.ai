-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('material', 'conversion', 'packing', 'inland_freight', 'cha', 'port', 'freight', 'insurance', 'finance_cost', 'duties', 'other');

-- CreateTable
CREATE TABLE "CostSheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "incoterm" TEXT NOT NULL,
    "sellPricePerUnit" DOUBLE PRECISION NOT NULL,
    "rodtepPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSheetLine" (
    "id" TEXT NOT NULL,
    "costSheetId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "label" TEXT,
    "amountPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CostSheetLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostSheet_quoteId_key" ON "CostSheet"("quoteId");

-- CreateIndex
CREATE INDEX "CostSheet_tenantId_idx" ON "CostSheet"("tenantId");

-- CreateIndex
CREATE INDEX "CostSheetLine_costSheetId_idx" ON "CostSheetLine"("costSheetId");

-- AddForeignKey
ALTER TABLE "CostSheet" ADD CONSTRAINT "CostSheet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSheet" ADD CONSTRAINT "CostSheet_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSheetLine" ADD CONSTRAINT "CostSheetLine_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "CostSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
