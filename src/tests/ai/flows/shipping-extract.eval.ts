import { extractShippingDoc, type ShippingDoc } from '@/lib/ai/shipping-extract';
import { runStructuralEval, type StructuralCase } from '../harness';

const cases: StructuralCase<string, ShippingDoc>[] = [
  {
    name: 'booking confirmation with vessel, dates, container',
    input: `Dear Sir, booking confirmed. Booking no. MAA2641001. Vessel MSC AURORA V.612W. ETD Chennai 2026-11-03, ETA Hamburg 2026-11-28. Container CSQU3054383, seal SL778812, 40HC.`,
    score: (o) => o.bookingNumber === 'MAA2641001' && o.etd === '2026-11-03' && o.eta === '2026-11-28' && o.containers.length === 1 && o.containers[0].containerNumber === 'CSQU3054383' && o.containers[0].sealNumber === 'SL778812',
  },
  {
    name: 'a mistyped container number is copied as written, not corrected',
    input: `Container no: CSQU3054380 (20GP) loaded.`,
    score: (o) => o.containers.length === 1 && o.containers[0].containerNumber === 'CSQU3054380',
  },
  {
    name: 'nothing shipping-related -> nulls and no containers',
    input: `Thanks for your mail. We will revert on pricing next week.`,
    score: (o) => o.blNumber === null && o.bookingNumber === null && o.etd === null && o.containers.length === 0,
  },
  {
    name: 'ambiguous date is not guessed',
    input: `ETD 03/04/26 from Nhava Sheva.`,
    score: (o) => o.etd === null,
  },
];

export async function evalShippingExtract() {
  return runStructuralEval('shipping_doc_extract', cases, async (text, tenantId) => (await extractShippingDoc(text, tenantId, 'eval-harness')).doc);
}
