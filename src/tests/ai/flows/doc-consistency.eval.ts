import { runAiConsistencyPass } from '@/lib/doc-engine/ai-consistency';
import { buildDocModel, type DocModel, type DocType } from '@/lib/doc-engine/models';
import type { DocContext } from '@/lib/doc-engine/context';
import { runStructuralEval, type StructuralCase } from '../harness';

/**
 * Golden eval for the AI consistency pass (DOC_ENGINE_SPEC §4). Scored nightly, non-blocking: a new flow has
 * no baseline so it only records one, and the runner never regresses on it until a baseline is accepted.
 *
 * The deterministic rule engine is exact-match tested separately (src/tests/doc-engine/golden.ts). These
 * fixtures target only what the AI pass is FOR — meaning-level issues the rules structurally cannot see:
 *  - a description that differs in meaning (not just characters) across documents,
 *  - a value that is arithmetically self-consistent but an order of magnitude wrong.
 * Clean fixtures pin precision (the pass must stay silent when nothing is actually wrong).
 */

function baseContext(): DocContext {
  return {
    tenant: {
      legalName: 'Anabyn Exports Pvt Ltd',
      registeredAddress: '12 Textile Park Road, Karur, Tamil Nadu 639002',
      iecNumber: '0123456789',
      gstin: '27AAPFU0939F1ZV',
      adCode: '6390123',
      bankName: 'HDFC Bank',
      bankAccountNumber: '50200012345678',
      bankIfscOrSwift: 'HDFC0000123',
    },
    buyer: { name: 'Meridian Home GmbH', country: 'Germany', address: 'Hafenstrasse 4, 20359 Hamburg' },
    shipment: { incoterm: 'FOB', originPort: 'INMAA', destPort: 'DEHAM', destination: 'Germany' },
    currency: 'USD',
    lines: [
      { description: 'Cotton bath towels 500 GSM', quantity: 2000, unitPrice: 3.5, hsCode: '63026000' },
      { description: 'Cotton hand towels 400 GSM', quantity: 1500, unitPrice: 1.8, hsCode: '63029100' },
    ],
  };
}

const ALL: DocType[] = ['proforma_invoice', 'commercial_invoice', 'packing_list', 'certificate_of_origin'];

function buildSet(ctx: DocContext): DocModel[] {
  return ALL.map((t, i) => buildDocModel(t, ctx, `${t.slice(0, 2).toUpperCase()}-2026-${String(i + 1).padStart(4, '0')}`));
}

function clone(models: DocModel[]): DocModel[] {
  return JSON.parse(JSON.stringify(models));
}

// A description-meaning mismatch: the packing list describes line 0 as an entirely different material than the
// invoices. Character-diff rules can't judge "different goods"; the AI pass should.
function descriptionMismatch(): DocModel[] {
  const m = clone(buildSet(baseContext()));
  const pl = m.find((d) => d.type === 'packing_list')!;
  if (pl.type === 'packing_list') pl.body.lines[0].description = 'Polyester microfibre cleaning cloths';
  return m;
}

// An order-of-magnitude price error kept arithmetically self-consistent so every deterministic total rule
// passes — only judgement flags $35/pc for a cotton towel.
function suspiciousUnitPrice(): DocModel[] {
  const m = clone(buildSet(baseContext()));
  for (const d of m) {
    if (d.type === 'commercial_invoice' || d.type === 'proforma_invoice') {
      const line = d.body.lines[0];
      const delta = line.unitPrice * 9 * line.quantity; // bump 3.5 -> 35
      line.unitPrice *= 10;
      line.lineTotal *= 10;
      d.body.total += delta;
    }
  }
  return m;
}

const cases: StructuralCase<DocModel[], Awaited<ReturnType<typeof runAiConsistencyPass>>>[] = [
  {
    name: 'clean full set -> no findings',
    input: buildSet(baseContext()),
    score: (findings) => findings.length === 0,
  },
  {
    name: 'description means different goods across CI/PL -> flagged',
    input: descriptionMismatch(),
    score: (findings) => findings.some((f) => f.docTypes.includes('packing_list')),
  },
  {
    name: 'unit price off by 10x but arithmetic-consistent -> flagged',
    input: suspiciousUnitPrice(),
    score: (findings) => findings.some((f) => f.docTypes.includes('commercial_invoice')),
  },
];

export async function evalDocConsistency() {
  return runStructuralEval('document_consistency', cases, async (models, tenantId) =>
    runAiConsistencyPass(models, tenantId, 'eval-harness'),
  );
}
