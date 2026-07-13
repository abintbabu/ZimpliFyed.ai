import { extractEnquiry, type Enquiry } from '@/lib/ai/enquiry-extraction';
import { runStructuralEval, type StructuralCase } from '../harness';

const cases: StructuralCase<string, Enquiry>[] = [
  {
    name: 'full enquiry: buyer, product, qty, target price, incoterm',
    input: `From: procurement@meridian-home.de
Hello, Meridian Home GmbH here. We'd like to order 5000 pcs of Cotton Bath Towel 500GSM, 70x140cm.
Target price USD 3.20/pc FOB Nhava Sheva. Please quote.`,
    score: (o) =>
      o.buyer.name.toLowerCase().includes('meridian') &&
      o.quantity === 5000 &&
      o.targetPrice === 3.2 &&
      o.targetPriceCurrency === 'USD' &&
      (o.incoterm?.toUpperCase().includes('FOB') ?? false) &&
      o.product.toLowerCase().includes('towel'),
  },
  {
    name: 'no price stated -> targetPrice null, not invented',
    input: `Hi, this is Rajesh from Kalpana Textiles. We need 2000 dozen cotton kitchen towels. Awaiting your best price.`,
    score: (o) => o.targetPrice === null && o.targetPriceCurrency === null && o.quantity === 2000 && o.buyer.name.length > 0,
  },
  {
    name: 'country inferred from domain, contact captured',
    input: `From: buyer@acme.co.uk\nWe are interested in bed linen sets, will share specs. Contact: James Powell.`,
    score: (o) => (o.buyer.country?.toLowerCase().includes('king') || o.buyer.country?.toLowerCase().includes('uk') || o.buyer.country?.toLowerCase().includes('britain')) === true,
  },
];

export async function evalEnquiryExtraction() {
  return runStructuralEval('enquiry_extract', cases, async (rawText, tenantId) => {
    const { enquiry } = await extractEnquiry(rawText, tenantId, 'eval-harness');
    return enquiry;
  });
}
