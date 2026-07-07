-- CreateTable
CREATE TABLE "HsCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsCode" TEXT NOT NULL,
    "dutyRatePct" DOUBLE PRECISION,
    "rodtepRatePct" DOUBLE PRECISION,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HsCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HsCode_tenantId_idx" ON "HsCode"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HsCode_tenantId_description_key" ON "HsCode"("tenantId", "description");

-- AddForeignKey
ALTER TABLE "HsCode" ADD CONSTRAINT "HsCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
