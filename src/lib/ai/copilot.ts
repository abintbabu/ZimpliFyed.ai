import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { anthropic } from './anthropic';
import { enforceAiBudget } from '@/ai/budget';
import { recordAiInteraction, computeCostUsd, ANTHROPIC_TIER_MODEL } from '@/ai/router';
import { toolsForRole } from '@/ai/retrieval';
import { hasPermission } from '@/lib/permissions';
import type { MembershipRole } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';

export type CopilotMessage = { role: 'user' | 'assistant'; content: string };

const MODEL = ANTHROPIC_TIER_MODEL.draft;
const MAX_TOOL_TURNS = 4;

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'src', 'ai', 'prompts', 'copilot', 'v1.md');

/**
 * Tool-use Copilot (AI_PLATFORM_SPEC §4): the model only ever sees the retrieval tools the caller's role has
 * permission for (structural isolation, not a prompt instruction) — e.g. a sales role never gets `list_quote_margins`
 * offered, so it cannot fetch margin data regardless of how it's asked. Runs its own multi-turn loop (not `runAi`,
 * which is single-call), then records one AiInteraction covering the whole exchange via the shared recorder.
 */
export async function askCopilot(tenantId: string, userId: string, role: MembershipRole, history: CopilotMessage[]) {
  await enforceAiBudget(tenantId);

  const tools = toolsForRole((p) => hasPermission(role, p));
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: { type: 'object', properties: {} },
  }));

  const system = await fs.readFile(SYSTEM_PROMPT_PATH, 'utf-8');
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalText = '';
  let finalModel = MODEL;
  const start = Date.now();

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    finalModel = response.model;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const textBlock = response.content.find((b) => b.type === 'text');
    finalText = textBlock?.type === 'text' ? textBlock.text : finalText;

    if (toolUses.length === 0 || response.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const tool = tools.find((t) => t.name === use.name);
      const result = tool ? await tool.run(tenantId) : 'This tool is not available to your role.';
      toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  const latencyMs = Date.now() - start;
  const costUsd = computeCostUsd(finalModel, totalInputTokens, totalOutputTokens);
  const last = history[history.length - 1];

  const interactionId = await recordAiInteraction({
    tenantId,
    userId,
    flowId: 'copilot',
    promptVersion: 'v1',
    model: finalModel,
    tier: 'draft',
    inputSummary: last?.content ?? '',
    output: finalText,
    latencyMs,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd,
  });

  return { text: finalText, interactionId };
}
