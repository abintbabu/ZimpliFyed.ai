-- CreateEnum
CREATE TYPE "ExportDocumentType" AS ENUM ('proforma_invoice', 'commercial_invoice', 'packing_list', 'certificate_of_origin');

-- CreateTable
CREATE TABLE "ExportDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "ExportDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportDocument_tenantId_orderId_idx" ON "ExportDocument"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ExportDocument_orderId_type_version_key" ON "ExportDocument"("orderId", "type", "version");

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
