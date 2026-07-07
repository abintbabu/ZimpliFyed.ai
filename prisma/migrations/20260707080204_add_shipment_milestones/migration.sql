-- CreateEnum
CREATE TYPE "ShipmentMilestoneType" AS ENUM ('gate_in', 'sob', 'transhipment', 'arrival', 'do_issued', 'delivered');

-- CreateTable
CREATE TABLE "ShipmentMilestone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "ShipmentMilestoneType" NOT NULL,
    "plannedAt" TIMESTAMP(3),
    "actualAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentMilestone_tenantId_orderId_idx" ON "ShipmentMilestone"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentMilestone_orderId_type_key" ON "ShipmentMilestone"("orderId", "type");

-- AddForeignKey
ALTER TABLE "ShipmentMilestone" ADD CONSTRAINT "ShipmentMilestone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMilestone" ADD CONSTRAINT "ShipmentMilestone_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
