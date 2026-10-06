import { extractLcTermsFromText, type LcTerms } from '@/lib/ai/lc-extract';
import { runStructuralEval, type StructuralCase } from '../harness';

const cases: StructuralCase<string, LcTerms>[] = [
  {
    name: 'explicit amount, dates and documents',
    input: `31D DATE AND PLACE OF EXPIRY: 261231 AT OUR COUNTERS\n32B CURRENCY CODE, AMOUNT: USD 125000,00\n44C LATEST DATE OF SHIPMENT: 261115\n46A DOCUMENTS REQUIRED: +SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS +PACKING LIST +FULL SET OF CLEAN ON BOARD OCEAN BILL OF LADING +CERTIFICATE OF ORIGIN`,
    score: (o) => o.amount === 125000 && o.currency === 'USD' && o.expiryDate === '2026-12-31' && o.latestShipmentDate === '2026-11-15' && o.requiredDocuments.length === 4,
  },
  {
    name: 'nothing stated -> nulls, not invented',
    input: `We will open an LC for your order in due course. Please confirm the pro-forma.`,
    score: (o) => o.amount === null && o.expiryDate === null && o.latestShipmentDate === null && o.requiredDocuments.length === 0,
  },
  {
    name: 'ambiguous date is not guessed',
    input: `Latest shipment 03/04/26. Amount about EUR 50,000.`,
    score: (o) => o.latestShipmentDate === null && o.amount === 50000 && o.currency === 'EUR',
  },
];

export async function evalLcExtract() {
  return runStructuralEval('lc_extract', cases, async (text, tenantId) => (await extractLcTermsFromText(text, tenantId, 'eval-harness')).terms);
}
