import type { DocContext } from '../../lib/doc-engine/context';
import { buildDocModel, type DocModel, type DocType } from '../../lib/doc-engine/models';
import { runRules } from '../../lib/doc-engine/rules';

/**
 * Golden-file harness for the deterministic doc-engine (DOC_ENGINE_SPEC §4).
 *
 * Each fixture is a set of DocModels (built from a valid base context, then optionally mutated to break
 * exactly one invariant) plus the exact set of rule IDs the engine must report. The rule pass is
 * exact-match: extra or missing findings both fail. Every rule in rules.ts has at least one violating
 * fixture here, plus clean fixtures that must report nothing — that pairing is what pins the engine's
 * behavior so a future refactor can't silently change what ships to a customs officer.
 *
 * Run: npx tsx --conditions=react-server src/tests/doc-engine/golden.ts
 */

// A fully valid India-pack context: 10-digit IEC, 15-char GSTIN, 8-digit HS codes, consistent everywhere.
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
    // Fixed, never `new Date()` — a golden fixture that changes with the calendar pins nothing.
    issuedAt: '2026-08-31',
    lines: [
      { description: 'Cotton bath towels 500 GSM', quantity: 2000, unitPrice: 3.5, hsCode: '63026000' },
      { description: 'Cotton hand towels 400 GSM', quantity: 1500, unitPrice: 1.8, hsCode: '63029100' },
    ],
  };
}

function buildSet(ctx: DocContext, types: DocType[]): DocModel[] {
  return types.map((t, i) => buildDocModel(t, ctx, `${t.slice(0, 2).toUpperCase()}-2026-${String(i + 1).padStart(4, '0')}`));
}

const ALL: DocType[] = ['proforma_invoice', 'commercial_invoice', 'packing_list', 'certificate_of_origin'];

type Fixture = { name: string; models: DocModel[]; expect: string[] };

/** Deep-clone a model set so a mutation in one fixture can't leak into another. */
function clone(models: DocModel[]): DocModel[] {
  return JSON.parse(JSON.stringify(models));
}

function fixtures(): Fixture[] {
  const out: Fixture[] = [];

  // ── Clean fixtures (must report nothing) ──────────────────────────────────
  out.push({ name: 'clean/full-set', models: buildSet(baseContext(), ALL), expect: [] });
  out.push({ name: 'clean/ci+pl-only', models: buildSet(baseContext(), ['commercial_invoice', 'packing_list']), expect: [] });
  out.push({ name: 'clean/pi+ci', models: buildSet(baseContext(), ['proforma_invoice', 'commercial_invoice']), expect: [] });
  out.push({ name: 'clean/single-quantity-line', models: buildSet({ ...baseContext(), lines: [baseContext().lines[0]] }, ALL), expect: [] });

  // ── Totals ────────────────────────────────────────────────────────────────
  {
    const m = clone(buildSet(baseContext(), ALL));
    const ci = m.find((d) => d.type === 'commercial_invoice')!;
    if (ci.type === 'commercial_invoice') ci.body.total += 100; // total ≠ line sum, lines still valid
    out.push({ name: 'break/ci-total-mismatch', models: m, expect: ['ci_total_equals_line_sum'] });
  }
  {
    const m = clone(buildSet(baseContext(), ALL));
    const ci = m.find((d) => d.type === 'commercial_invoice')!;
    if (ci.type === 'commercial_invoice') {
      ci.body.lines[0].lineTotal += 50; // line total wrong; keep set total = new sum so only the line rule fires
      ci.body.total += 50;
    }
    out.push({ name: 'break/ci-line-total-mismatch', models: m, expect: ['line_total_equals_qty_times_price'] });
  }

  // ── CI ↔ PL quantity ────────────────────────────────────────────────────
  {
    const m = clone(buildSet(baseContext(), ALL));
    const pl = m.find((d) => d.type === 'packing_list')!;
    if (pl.type === 'packing_list') pl.body.lines[0].quantity += 10;
    out.push({ name: 'break/ci-pl-qty-diff', models: m, expect: ['ci_pl_quantity_match'] });
  }
  {
    const m = clone(buildSet(baseContext(), ALL));
    const pl = m.find((d) => d.type === 'packing_list')!;
    if (pl.type === 'packing_list') pl.body.lines.pop(); // line count mismatch
    out.push({ name: 'break/ci-pl-line-count', models: m, expect: ['ci_pl_quantity_match'] });
  }

  // ── Identity: currency / incoterm / consignee ─────────────────────────────
  {
    const m = clone(buildSet(baseContext(), ALL));
    m.find((d) => d.type === 'packing_list')!.currency = 'EUR';
    out.push({ name: 'break/currency-nonuniform', models: m, expect: ['currency_uniform'] });
  }
  {
    const m = clone(buildSet(baseContext(), ALL));
    m.find((d) => d.type === 'packing_list')!.incoterm = 'CIF';
    out.push({ name: 'break/incoterm-nonuniform', models: m, expect: ['incoterm_uniform'] });
  }
  {
    const m = clone(buildSet(baseContext(), ALL));
    m.find((d) => d.type === 'packing_list')!.buyer.name = 'Different Buyer Ltd';
    out.push({ name: 'break/consignee-nonuniform', models: m, expect: ['consignee_uniform'] });
  }

  // ── India-pack format rules ───────────────────────────────────────────────
  out.push({ name: 'break/iec-too-short', models: buildSet({ ...baseContext(), tenant: { ...baseContext().tenant, iecNumber: '123' } }, ALL), expect: ['in_iec_format'] });
  out.push({ name: 'break/iec-non-numeric', models: buildSet({ ...baseContext(), tenant: { ...baseContext().tenant, iecNumber: '01234ABCDE' } }, ALL), expect: ['in_iec_format'] });
  out.push({ name: 'break/hs-code-too-short', models: buildSet({ ...baseContext(), lines: [{ ...baseContext().lines[0], hsCode: '6302' }, baseContext().lines[1]] }, ALL), expect: ['in_hs_code_8_digit'] });
  out.push({ name: 'break/gstin-format', models: buildSet({ ...baseContext(), tenant: { ...baseContext().tenant, gstin: 'BADGSTIN123' } }, ALL), expect: ['in_gstin_format'] });

  // ── Combined violations (order + multiplicity) ────────────────────────────
  {
    const m = clone(buildSet({ ...baseContext(), tenant: { ...baseContext().tenant, iecNumber: '123', gstin: 'BADGSTIN123' } }, ALL));
    m.find((d) => d.type === 'packing_list')!.incoterm = 'CIF';
    out.push({ name: 'break/multi-iec-gstin-incoterm', models: m, expect: ['in_iec_format', 'incoterm_uniform', 'in_gstin_format'] });
  }
  {
    const m = clone(buildSet({ ...baseContext(), lines: [{ ...baseContext().lines[0], hsCode: '6302' }, { ...baseContext().lines[1], hsCode: '6109' }] }, ALL));
    out.push({ name: 'break/both-hs-short', models: m, expect: ['in_hs_code_8_digit', 'in_hs_code_8_digit'] });
  }

  // ── Subset fixtures: pack rules that need only CI ──────────────────────────
  out.push({ name: 'break/ci-only-iec', models: buildSet({ ...baseContext(), tenant: { ...baseContext().tenant, iecNumber: 'X' } }, ['commercial_invoice']), expect: ['in_iec_format'] });
  out.push({ name: 'clean/ci-only', models: buildSet(baseContext(), ['commercial_invoice']), expect: [] });
  out.push({ name: 'clean/pi-only', models: buildSet(baseContext(), ['proforma_invoice']), expect: [] });

  return out;
}

/**
 * Field-level assertions on the built models, alongside the rule fixtures above.
 *
 * The rule pass only sees what rules.ts looks at, so a field could silently stop being carried into the
 * DocModel — and therefore off the printed document — without a single rule fixture failing. These pin the
 * blocks a customs officer and a paying buyer actually read: the remittance details, the issue date, and
 * the amount in words.
 */
function modelAssertions(): { name: string; ok: boolean; detail: string }[] {
  const ctx = baseContext();
  const set = buildSet(ctx, ALL);
  const ci = set.find((d) => d.type === 'commercial_invoice')!;
  const pl = set.find((d) => d.type === 'packing_list')!;
  const out: { name: string; ok: boolean; detail: string }[] = [];

  const check = (name: string, ok: boolean, detail = '') => out.push({ name, ok, detail });

  // Bank details reach every document. DocContext has always required them; before the PDF renderer
  // landed nothing carried them into the model, so a proforma printed with no way to pay it.
  for (const d of set) {
    check(`bank/${d.type}/account`, d.bank.accountNumber === ctx.tenant.bankAccountNumber, `got "${d.bank.accountNumber}"`);
    check(`bank/${d.type}/ifsc`, d.bank.ifscOrSwift === ctx.tenant.bankIfscOrSwift, `got "${d.bank.ifscOrSwift}"`);
    // The account must be in the exporter's own legal name — a mismatch gets the remittance rejected.
    check(`bank/${d.type}/account-name-matches-exporter`, d.bank.accountName === d.exporter.legalName, `got "${d.bank.accountName}"`);
    check(`identity/${d.type}/ad-code`, d.exporter.adCode === ctx.tenant.adCode, `got "${d.exporter.adCode}"`);
    check(`date/${d.type}/issuedAt`, d.issuedAt === ctx.issuedAt, `got "${d.issuedAt}"`);
  }

  // Amount in words must agree with the figure it sits beside.
  if (ci.type === 'commercial_invoice') {
    check('words/total', ci.body.total === 9700, `expected 9700, got ${ci.body.total}`);
    check(
      'words/text',
      ci.body.totalInWords === 'Nine Thousand Seven Hundred Only',
      `got "${ci.body.totalInWords}"`,
    );
  }

  // A fractional total must name its subunits, and use the currency's own subunit label.
  const frac = buildSet({ ...ctx, lines: [{ ...ctx.lines[0], quantity: 1, unitPrice: 1234.5 }] }, ['commercial_invoice'])[0];
  if (frac.type === 'commercial_invoice') {
    check(
      'words/fractional',
      frac.body.totalInWords === 'One Thousand Two Hundred Thirty Four and Fifty Cents Only',
      `got "${frac.body.totalInWords}"`,
    );
  }
  const inr = buildSet({ ...ctx, currency: 'INR', lines: [{ ...ctx.lines[0], quantity: 1, unitPrice: 100.25 }] }, ['commercial_invoice'])[0];
  if (inr.type === 'commercial_invoice') {
    check('words/inr-paise', inr.body.totalInWords === 'One Hundred and Twenty Five Paise Only', `got "${inr.body.totalInWords}"`);
  }
  // Indian grouping, not millions — this is what the bank and customs read.
  const lakh = buildSet({ ...ctx, lines: [{ ...ctx.lines[0], quantity: 1, unitPrice: 2_500_000 }] }, ['commercial_invoice'])[0];
  if (lakh.type === 'commercial_invoice') {
    check('words/lakh-crore-grouping', lakh.body.totalInWords === 'Twenty Five Lakh Only', `got "${lakh.body.totalInWords}"`);
  }

  // A packing list carries no prices — leaking unit prices onto the document that travels with the cargo
  // is exactly the disclosure exporters ask us to prevent.
  check('packing/no-price-fields', pl.type === 'packing_list' && !JSON.stringify(pl.body).includes('unitPrice'));

  return out;
}

function run() {
  const all = fixtures();
  let passed = 0;
  const failures: string[] = [];

  for (const f of all) {
    const findings = runRules(f.models, 'in');
    const gotIds = findings.map((x) => x.ruleId).sort();
    const wantIds = [...f.expect].sort();
    if (JSON.stringify(gotIds) === JSON.stringify(wantIds)) {
      passed++;
    } else {
      failures.push(`  ✗ ${f.name}\n      expected: [${wantIds.join(', ')}]\n      got:      [${gotIds.join(', ')}]`);
    }
  }

  const assertions = modelAssertions();
  for (const a of assertions) {
    if (a.ok) passed++;
    else failures.push(`  ✗ ${a.name}${a.detail ? `\n      ${a.detail}` : ''}`);
  }

  const total = all.length + assertions.length;
  if (failures.length) {
    console.error(`✗ doc-engine golden: ${passed}/${total} passed\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(
    `✓ doc-engine golden: ${all.length} rule fixtures + ${assertions.length} model assertions pass ` +
      `(every rule has a violating + a clean fixture)`,
  );
}

run();
