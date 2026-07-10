import { extractRfqSpec } from '@/lib/ai/rfq-extraction';
import { runStructuralEval, type StructuralCase } from '../harness';
import type { RfqSpec } from '@/lib/ai/rfq-extraction';

const cases: StructuralCase<string, RfqSpec>[] = [
  {
    name: 'basic towel RFQ with quantity, unit, target price',
    input: `Hi, we're looking for 5000 pcs of Cotton Bath Towel 500GSM, sizes 70x140cm. Target price USD 3.20/pc, FOB Nhava Sheva, delivery in 45 days.`,
    score: (out) =>
      out.quantity === 5000 &&
      out.unit?.toLowerCase().includes('pc') === true &&
      out.targetPrice === 3.2 &&
      out.targetPriceCurrency === 'USD' &&
      out.sizes.some((s) => s.includes('70x140')),
  },
  {
    name: 'no target price mentioned -> null, not invented',
    input: `We need 2000 dozen cotton kitchen towels, packed 12pcs/poly bag, 24 bags/carton. No price mentioned yet, waiting on your quote.`,
    score: (out) => out.targetPrice === null && out.targetPriceCurrency === null && out.quantity === 2000,
  },
  {
    name: 'vague description, minimal fields',
    input: `Interested in bed sheets, will send full spec later.`,
    score: (out) => out.quantity === null && out.sizes.length === 0,
  },
];

export async function evalRfqExtraction() {
  return runStructuralEval('rfq_extraction', cases, async (rawText, tenantId) => {
    const { spec } = await extractRfqSpec(rawText, tenantId, 'eval-harness');
    return spec;
  });
}
