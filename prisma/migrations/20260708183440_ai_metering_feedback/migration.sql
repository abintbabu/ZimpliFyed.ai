-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('copilot', 'rfq_extraction');

-- CreateEnum
CREATE TYPE "AiFeedbackRating" AS ENUM ('accept', 'edit', 'reject');

-- CreateEnum
CREATE TYPE "MeterEventKind" AS ENUM ('ai_action', 'doc_set', 'shipment');

-- CreateTable
CREATE TABLE "AiInteraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "aiInteractionId" TEXT NOT NULL,
    "rating" "AiFeedbackRating" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "MeterEventKind" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInteraction_tenantId_feature_idx" ON "AiInteraction"("tenantId", "feature");

-- CreateIndex
CREATE INDEX "AiInteraction_tenantId_createdAt_idx" ON "AiInteraction"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeedback_aiInteractionId_key" ON "AiFeedback"("aiInteractionId");

-- CreateIndex
CREATE INDEX "MeterEvent_tenantId_kind_createdAt_idx" ON "MeterEvent"("tenantId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AiInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterEvent" ADD CONSTRAINT "MeterEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
