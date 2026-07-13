import fs from 'node:fs/promises';
import path from 'node:path';
import { evalRfqExtraction } from './flows/rfq-extraction.eval';
import { evalBuyerFollowup } from './flows/buyer-followup.eval';
import { evalEnquiryExtraction } from './flows/enquiry-extraction.eval';
import { evalDocConsistency } from './flows/doc-consistency.eval';

/**
 * Eval runner (AI_PLATFORM_SPEC §5). Run with `npm run eval:ai`, or nightly via
 * .github/workflows/ai-nightly-eval.yml. Prints a per-flow scorecard and fails (exit 1) if any flow's score
 * regresses below its stored baseline — the gate behind "no prompt-version bump ships without an eval run
 * ≥ previous score." Pass --update-baselines to accept the current run's scores as the new baseline.
 */

const BASELINES_PATH = path.join(process.cwd(), 'src', 'tests', 'ai', 'baselines.json');

async function loadBaselines(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(BASELINES_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

async function main() {
  const updateBaselines = process.argv.includes('--update-baselines');
  const baselines = await loadBaselines();

  const evals = [await evalRfqExtraction(), await evalBuyerFollowup(), await evalEnquiryExtraction(), await evalDocConsistency()];

  let regressed = false;
  console.log('\nAI eval scorecard\n' + '='.repeat(60));

  for (const evalResult of evals) {
    const baseline = baselines[evalResult.flowId];
    const delta = baseline != null ? evalResult.score - baseline : null;
    const status = baseline == null ? 'new' : delta! < 0 ? 'REGRESSED' : delta! > 0 ? 'improved' : 'stable';

    console.log(`\n${evalResult.flowId}: ${(evalResult.score * 100).toFixed(0)}%${baseline != null ? ` (baseline ${(baseline * 100).toFixed(0)}%, ${status})` : ' (no baseline)'}`);
    for (const r of evalResult.results) {
      const label = 'passed' in r ? (r.passed ? 'PASS' : 'FAIL') : `${(r.score * 100).toFixed(0)}%`;
      console.log(`  [${label}] ${r.name}${'error' in r && r.error ? ` — ERROR: ${r.error}` : ''}`);
    }

    if (baseline != null && evalResult.score < baseline) regressed = true;
    if (updateBaselines || baseline == null) baselines[evalResult.flowId] = evalResult.score;
  }

  console.log('\n' + '='.repeat(60));

  if (updateBaselines) {
    await fs.writeFile(BASELINES_PATH, JSON.stringify(baselines, null, 2) + '\n');
    console.log('Baselines updated.');
  } else if (regressed) {
    console.error('\nOne or more flows regressed below their baseline score. Fix the prompt or run with --update-baselines to accept.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
