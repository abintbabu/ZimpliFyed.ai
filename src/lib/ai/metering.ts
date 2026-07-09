import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AiFeature } from '@prisma/client';

/** Records one AiInteraction + its metering event. The single chokepoint every AI action calls after a model response. */
export async function recordAiInteraction(input: {
  tenantId: string;
  userId?: string;
  feature: AiFeature;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const interaction = await prisma.aiInteraction.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
    },
  });

  await prisma.meterEvent.create({
    data: {
      tenantId: input.tenantId,
      kind: 'ai_action',
      metadata: { feature: input.feature, model: input.model },
    },
  });

  return interaction;
}
