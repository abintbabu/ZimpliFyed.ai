import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from '@/lib/ai/anthropic';
import { prisma } from '@/lib/prisma';
import { enforceAiBudget } from './budget';

export type AiTier = 'extract' | 'draft' | 'reason';

type Provider = 'anthropic' | 'gemini';

type ModelCandidate = { provider: Provider; model: string };

/** Tier -> primary model, env-overridable. Fallback provider (Gemini) only enters the chain if GEMINI_API_KEY is set. */
export const ANTHROPIC_TIER_MODEL: Record<AiTier, string> = {
  extract: process.env.AI_MODEL_EXTRACT_ANTHROPIC ?? 'claude-haiku-4-5-20251001',
  draft: process.env.AI_MODEL_DRAFT_ANTHROPIC ?? 'claude-sonnet-5',
  reason: process.env.AI_MODEL_REASON_ANTHROPIC ?? 'claude-opus-4-8',
};

const GEMINI_TIER_MODEL: Record<AiTier, string> = {
  extract: process.env.AI_MODEL_EXTRACT_GEMINI ?? 'gemini-2.5-flash',
  draft: process.env.AI_MODEL_DRAFT_GEMINI ?? 'gemini-2.5-flash',
  reason: process.env.AI_MODEL_REASON_GEMINI ?? 'gemini-2.5-pro',
};

/** USD per million tokens. Unknown models fall back to a conservative estimate. */
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 15, out: 75 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-pro': { in: 1.25, out: 10 },
};
const DEFAULT_PRICE = { in: 5, out: 15 };

function buildChain(tier: AiTier): ModelCandidate[] {
  const chain: ModelCandidate[] = [{ provider: 'anthropic', model: ANTHROPIC_TIER_MODEL[tier] }];
  if (process.env.GEMINI_API_KEY) chain.push({ provider: 'gemini', model: GEMINI_TIER_MODEL[tier] });
  return chain;
}

export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK[model] ?? DEFAULT_PRICE;
  return (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
}

const promptCache = new Map<string, string>();

async function loadPrompt(flowId: string, promptVersion: string): Promise<string> {
  const key = `${flowId}/${promptVersion}`;
  const cached = promptCache.get(key);
  if (cached) return cached;
  const filePath = path.join(process.cwd(), 'src', 'ai', 'prompts', flowId, `${promptVersion}.md`);
  const text = await fs.readFile(filePath, 'utf-8');
  promptCache.set(key, text);
  return text;
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status != null) return status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
  const type = (err as { error?: { type?: string } })?.error?.type;
  return type === 'overloaded_error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

type ProviderResult = { text?: string; parsed?: unknown; model: string; inputTokens: number; outputTokens: number };

async function callAnthropic(
  model: string,
  args: { system: string; input: string; schema?: z.ZodTypeAny; maxTokens: number },
): Promise<ProviderResult> {
  if (args.schema) {
    const response = await anthropic.messages.parse({
      model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: 'user', content: args.input }],
      output_config: { format: zodOutputFormat(args.schema) },
    });
    if (!response.parsed_output) throw new Error('Model returned no structured output');
    return {
      parsed: response.parsed_output,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: 'user', content: args.input }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    text: textBlock?.type === 'text' ? textBlock.text : '',
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callGemini(
  model: string,
  args: { system: string; input: string; schema?: z.ZodTypeAny; maxTokens: number },
): Promise<ProviderResult> {
  const generationConfig: Record<string, unknown> = { maxOutputTokens: args.maxTokens };
  if (args.schema) {
    generationConfig.responseMimeType = 'application/json';
    // Gemini expects an OpenAPI-3.0-ish subset (no $schema, no additionalProperties) — strip what it rejects.
    const { $schema: _drop, additionalProperties: _drop2, ...schema } = z.toJSONSchema(args.schema) as Record<string, unknown>;
    generationConfig.responseSchema = schema;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: 'user', parts: [{ text: args.input }] }],
        generationConfig,
      }),
    },
  );
  if (!res.ok) {
    const err = new Error(`Gemini request failed (${res.status})`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const content: string = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  const result = {
    model,
    inputTokens: (json.usageMetadata?.promptTokenCount as number) ?? 0,
    outputTokens: (json.usageMetadata?.candidatesTokenCount as number) ?? 0,
  };
  if (args.schema) return { ...result, parsed: args.schema.parse(JSON.parse(content)) };
  return { ...result, text: content };
}

async function callProvider(
  candidate: ModelCandidate,
  args: { system: string; input: string; schema?: z.ZodTypeAny; maxTokens: number },
): Promise<ProviderResult> {
  return candidate.provider === 'anthropic' ? callAnthropic(candidate.model, args) : callGemini(candidate.model, args);
}

export type AiTask<TSchema extends z.ZodTypeAny | undefined = undefined> = {
  flowId: string;
  tier: AiTier;
  input: string;
  tenantId: string;
  userId?: string;
  schema?: TSchema;
  /** Defaults to 'v1'. Loaded from src/ai/prompts/{flowId}/{promptVersion}.md unless `system` is passed directly. */
  promptVersion?: string;
  /** Overrides the file-loaded system prompt (e.g. for flows that need dynamic context, like copilot). */
  system?: string;
  maxTokens?: number;
  /** Redacted/truncated fingerprint of the input stored on the audit row. Defaults to a truncated `input`. */
  inputSummary?: string;
};

export type AiResult<T> = {
  output: T;
  interactionId: string;
  model: string;
  costUsd: number;
};

const TIMEOUT_MS = 30_000;
const RETRIES_PER_MODEL = 2;

/** Shared audit chokepoint used by `runAi` and by multi-turn flows (e.g. Copilot's tool-use loop in
 * src/lib/ai/copilot.ts) that can't express their whole exchange as a single runAi() call. */
export async function recordAiInteraction(input: {
  tenantId: string;
  userId?: string;
  flowId: string;
  promptVersion: string;
  model: string;
  tier: AiTier;
  inputSummary: string;
  output: unknown;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): Promise<string> {
  const interaction = await prisma.$transaction(async (tx) => {
    const created = await tx.aiInteraction.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        flowId: input.flowId,
        promptVersion: input.promptVersion,
        model: input.model,
        tier: input.tier,
        inputSummary: input.inputSummary.slice(0, 500),
        output: input.output as object,
        latencyMs: input.latencyMs,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsd: input.costUsd,
      },
    });
    await tx.meterEvent.create({
      data: { tenantId: input.tenantId, kind: 'ai_action', metadata: { flowId: input.flowId, model: input.model } },
    });
    return created;
  });
  return interaction.id;
}

/** Single entry point for every AI call in the app. Structured output (when `schema` is passed), tiered model routing with
 * an Anthropic -> Gemini fallback chain, budget enforcement, and AiInteraction/MeterEvent audit writes all happen here —
 * flows should never call the Anthropic SDK directly. */
export async function runAi<TSchema extends z.ZodTypeAny>(
  task: AiTask<TSchema> & { schema: TSchema },
): Promise<AiResult<z.infer<TSchema>>>;
export async function runAi(task: AiTask<undefined>): Promise<AiResult<string>>;
export async function runAi(task: AiTask<z.ZodTypeAny | undefined>): Promise<AiResult<unknown>> {
  await enforceAiBudget(task.tenantId);

  const promptVersion = task.promptVersion ?? 'v1';
  const system = task.system ?? (await loadPrompt(task.flowId, promptVersion));
  const maxTokens = task.maxTokens ?? 2048;
  const chain = buildChain(task.tier);

  const start = Date.now();
  let lastErr: unknown;

  for (const candidate of chain) {
    for (let attempt = 0; attempt < RETRIES_PER_MODEL; attempt++) {
      try {
        const result = await withTimeout(
          callProvider(candidate, { system, input: task.input, schema: task.schema, maxTokens }),
          TIMEOUT_MS,
        );
        const latencyMs = Date.now() - start;
        const costUsd = computeCostUsd(result.model, result.inputTokens, result.outputTokens);
        const output = task.schema ? result.parsed : result.text;

        const interactionId = await recordAiInteraction({
          tenantId: task.tenantId,
          userId: task.userId,
          flowId: task.flowId,
          promptVersion,
          model: result.model,
          tier: task.tier,
          inputSummary: task.inputSummary ?? task.input,
          output,
          latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd,
        });

        return { output, interactionId, model: result.model, costUsd };
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err) || attempt === RETRIES_PER_MODEL - 1) break;
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('AI request failed');
}
