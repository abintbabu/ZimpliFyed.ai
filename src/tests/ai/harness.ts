import 'server-only';
import { runAi } from '@/ai/router';
import { getSystemTenantId } from '@/lib/ai/system-tenant';

/**
 * AI eval harness (AI_PLATFORM_SPEC §5). Two scoring classes:
 *  - structural: exact/field-level comparison against a known-good expected value (extraction, classification).
 *  - judged: a rubric scored 0-1 by a judge model (drafts, free text).
 * Feed sources per the spec: golden fixtures below, plus `edited` AiInteractions and rejected+reason from
 * production (not wired into this harness yet — that's a follow-up once there's a meaningful volume of feedback).
 */

export type StructuralCase<TInput, TOutput> = {
  name: string;
  input: TInput;
  /** Returns true if `actual` is an acceptable output for this case. */
  score: (actual: TOutput) => boolean;
};

export type StructuralResult = { name: string; passed: boolean; error?: string };

export async function runStructuralEval<TInput, TOutput>(
  flowId: string,
  cases: StructuralCase<TInput, TOutput>[],
  run: (input: TInput, tenantId: string) => Promise<TOutput>,
): Promise<{ flowId: string; results: StructuralResult[]; score: number }> {
  const tenantId = await getSystemTenantId();
  const results: StructuralResult[] = [];

  for (const c of cases) {
    try {
      const actual = await run(c.input, tenantId);
      results.push({ name: c.name, passed: c.score(actual) });
    } catch (err) {
      results.push({ name: c.name, passed: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const score = results.filter((r) => r.passed).length / results.length;
  return { flowId, results, score };
}

export type JudgedCase<TInput> = {
  name: string;
  input: TInput;
  /** The rubric the judge model scores the draft against, in plain language. */
  rubric: string;
};

export type JudgedResult = { name: string; score: number; rationale: string; error?: string };

const JUDGE_SCHEMA_SYSTEM = `You are an eval judge for an AI product. Score the given draft output against the rubric on a 0.0-1.0 scale (1.0 = fully meets the rubric, 0.0 = fails it entirely). Respond with strict JSON: {"score": number, "rationale": string}. Be strict — a draft with a factual invention or a rubric violation should score below 0.5 regardless of how well-written it otherwise is.`;

async function judge(rubric: string, draftText: string, tenantId: string): Promise<{ score: number; rationale: string }> {
  const { z } = await import('zod');
  const JudgeSchema = z.object({ score: z.number().min(0).max(1), rationale: z.string() });
  const result = await runAi({
    flowId: 'eval_judge',
    tier: 'reason',
    tenantId,
    system: JUDGE_SCHEMA_SYSTEM,
    input: `## Rubric\n${rubric}\n\n## Draft output to score\n${draftText}`,
    schema: JudgeSchema,
    maxTokens: 512,
  });
  return result.output;
}

export async function runJudgedEval<TInput, TOutput>(
  flowId: string,
  cases: JudgedCase<TInput>[],
  run: (input: TInput, tenantId: string) => Promise<TOutput>,
  toDraftText: (output: TOutput) => string,
): Promise<{ flowId: string; results: JudgedResult[]; score: number }> {
  const tenantId = await getSystemTenantId();
  const results: JudgedResult[] = [];

  for (const c of cases) {
    try {
      const actual = await run(c.input, tenantId);
      const { score, rationale } = await judge(c.rubric, toDraftText(actual), tenantId);
      results.push({ name: c.name, score, rationale });
    } catch (err) {
      results.push({ name: c.name, score: 0, rationale: '', error: err instanceof Error ? err.message : String(err) });
    }
  }

  const score = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  return { flowId, results, score };
}
