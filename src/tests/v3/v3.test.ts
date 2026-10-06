import assert from 'node:assert/strict';
import { classifyRequiredDocument, kindFromFileName, buildChecklist, checkPresentation, type DocKind } from '../../lib/lc-presentation';
import { computeImportLandedCost } from '../../lib/import-landed-cost';
import { qcVerdict, runProgress } from '../../lib/qc';
import { csvCell, xmlEscape, accountantCsv, tallyVouchersXml } from '../../lib/accounting-export';
import { parseCadence, dueCadenceStep, DEFAULT_CADENCE } from '../../lib/cadence';
import { sessionWindow, sendModeFor, SESSION_WINDOW_MS } from '../../lib/whatsapp-window';
import { estimateRodtep } from '../../lib/rodtep-estimate';
import { generateInviteToken, hashInviteToken, looksLikeInviteToken, tokenMatches, inviteUsable, inviteExpiry } from '../../lib/invite-token';

/** V3 engines (pure): `npm run test:v3`. */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// ── LC document classification ──────────────────────────────────────────────
const cls: [string, DocKind][] = [
  ['Signed commercial invoice in 3 originals', 'commercial_invoice'], ['Packing list in duplicate', 'packing_list'], ['Detailed Packing and Weight list', 'packing_list'],
  ['Certificate of Origin issued by Chamber of Commerce', 'certificate_of_origin'], ['Full set of clean on board ocean Bill of Lading', 'bill_of_lading'], ['Air Waybill marked freight prepaid', 'airway_bill'],
  ['Insurance policy for 110% of CIF', 'insurance_certificate'], ['Phytosanitary certificate', 'phytosanitary_certificate'], ['Fumigation certificate', 'fumigation_certificate'],
  ['Pre-shipment inspection certificate', 'inspection_certificate'], ['Beneficiary\'s certificate confirming samples sent', 'beneficiary_certificate'], ['Draft at sight', 'draft'],
  ['Pro-forma invoice', 'proforma_invoice'], ['Test report from SGS lab', 'other'],
];
for (const [text, kind] of cls) assert.equal(classifyRequiredDocument(text), kind, text);
assert.equal(kindFromFileName('Commercial_Invoice-INV-42.pdf'), 'commercial_invoice'); assert.equal(kindFromFileName('PL_order7.xlsx'), null); assert.equal(kindFromFileName('packing list.pdf'), 'packing_list'); assert.equal(kindFromFileName('bl-scan.pdf'), 'bill_of_lading');

// ── Checklist ───────────────────────────────────────────────────────────────
{
  const have = new Set<DocKind>(['commercial_invoice', 'packing_list']);
  const c = buildChecklist(['Commercial invoice x3', 'Packing list', 'Bill of lading', 'Lab test report', '  '], have);
  assert.deepEqual(c.map((x) => x.status), ['ready', 'ready', 'missing', 'manual'], 'blank lines dropped; unrecognised is never "ready"');
}

// ── Presentation check ──────────────────────────────────────────────────────
const lc = { amount: 10000, currency: 'USD', expiryDate: d('2026-12-31'), latestShipmentDate: d('2026-10-31'), status: 'advised' };
const ready = [{ text: 'CI', kind: 'commercial_invoice' as DocKind, status: 'ready' as const }];
const base = { lc, shipmentDate: d('2026-10-20'), invoiceTotal: 9700, invoiceCurrency: 'USD', checklist: ready, now: d('2026-10-25') };
{
  const r = checkPresentation(base);
  assert.equal(r.ready, true); assert.equal(r.findings[0].code, 'all_clear');
  assert.equal(r.presentationDeadline!.toISOString().slice(0, 10), '2026-11-10', 'shipment + 21 days'); assert.equal(r.daysLeft, 16);
}
{ const r = checkPresentation({ ...base, shipmentDate: d('2026-11-03') }); assert.equal(r.ready, false); assert.ok(r.findings.some((f) => f.code === 'late_shipment' && /3 day/.test(f.message))); }
assert.ok(checkPresentation({ ...base, shipmentDate: d('2026-10-31') }).ready, 'shipping ON the latest date is fine');
{ const r = checkPresentation({ ...base, now: d('2026-11-15') }); assert.ok(r.findings.some((f) => f.code === 'window_closed' && /5 day/.test(f.message))); assert.equal(r.ready, false); }
{ const r = checkPresentation({ ...base, now: d('2026-11-07') }); assert.ok(r.findings.some((f) => f.code === 'window_closing')); assert.equal(r.ready, true, 'closing soon is a warning, not a discrepancy'); }
{ // expiry caps the window
  const r = checkPresentation({ ...base, lc: { ...lc, expiryDate: d('2026-11-01') } }); assert.equal(r.presentationDeadline!.toISOString().slice(0, 10), '2026-11-01');
}
assert.ok(checkPresentation({ ...base, invoiceTotal: 10000.01 }).findings.some((f) => f.code === 'over_amount'));
assert.ok(checkPresentation({ ...base, invoiceTotal: 10000 }).ready, 'exactly the LC amount is fine');
assert.ok(checkPresentation({ ...base, invoiceTotal: 10900, amountTolerance: 0.1 }).ready, '"about" tolerance honoured');
assert.ok(checkPresentation({ ...base, invoiceCurrency: 'EUR' }).findings.some((f) => f.code === 'currency_mismatch'));
assert.ok(checkPresentation({ ...base, invoiceTotal: 3000 }).findings.some((f) => f.code === 'low_utilisation'));
assert.ok(checkPresentation({ ...base, checklist: [{ text: 'B/L', kind: 'bill_of_lading', status: 'missing' }] }).findings.some((f) => f.code === 'missing_document'));
assert.ok(checkPresentation({ ...base, checklist: [{ text: 'Lab report', kind: 'other', status: 'manual' }] }).findings.some((f) => f.code === 'manual_check'));
assert.ok(checkPresentation({ ...base, checklist: [] }).findings.some((f) => f.code === 'no_checklist'));
for (const status of ['expired', 'cancelled', 'paid']) assert.equal(checkPresentation({ ...base, lc: { ...lc, status } }).ready, false);
{ const r = checkPresentation({ ...base, shipmentDate: null }); assert.ok(r.findings.some((f) => f.code === 'not_shipped')); assert.equal(r.presentationDeadline!.toISOString().slice(0, 10), '2026-12-31', 'unshipped → LC expiry is the only bound'); }
{ const r = checkPresentation({ ...base, lc: { ...lc, amount: null, currency: null } }); assert.ok(r.findings.some((f) => f.code === 'no_amount')); }

// ── Import landed cost ──────────────────────────────────────────────────────
{
  // One line: 1000 units × $2 at ₹80 = ₹160,000 FOB. Freight ₹8,000 + insurance ₹2,000 → CIF 170,000.
  // Landing 1% = 1,700 → AV 171,700. BCD 10% = 17,170; SWS 10% of BCD = 1,717; IGST 18% of (171,700+17,170+1,717)=190,587 → 34,305.66.
  const r = computeImportLandedCost({ currency: 'USD', exchangeRate: 80, freightInr: 8000, insuranceInr: 2000, chaInr: 3000, portInr: 1000,
    lines: [{ description: 'Widgets', quantity: 1000, unitPrice: 2, bcdPct: 10, swsPct: 10, igstPct: 18 }] });
  const l = r.lines[0];
  assert.equal(l.fobInr, 160000); assert.equal(l.landingChargeInr, 1700); assert.equal(l.assessableValue, 171700);
  assert.equal(l.bcd, 17170); assert.equal(l.sws, 1717); assert.equal(l.igst, 34305.66);
  assert.equal(l.clearanceInr, 4000);
  assert.equal(l.landedCost, 160000 + 8000 + 2000 + 17170 + 1717 + 4000, 'goods + freight + insurance + duties + clearance; NO igst, NO landing charge');
  assert.equal(l.landedCostPerUnit, 192.89);
  assert.equal(r.totals.uplift, Math.round(192887 / 160000 * 10000) / 10000);
  assert.ok(r.warnings.some((w) => /Verify rates/.test(w)) && r.warnings.some((w) => /IGST is shown separately/.test(w)));
}
{ // two lines: shared freight/insurance split by value; clearance by assessable value; totals reconcile
  const r = computeImportLandedCost({ currency: 'USD', exchangeRate: 80, freightInr: 10000, insuranceInr: 0, chaInr: 5000, landingChargePct: 0,
    lines: [{ description: 'A', quantity: 100, unitPrice: 3, bcdPct: 10, swsPct: 0, igstPct: 18 }, { description: 'B', quantity: 100, unitPrice: 1, bcdPct: 0, swsPct: 0, igstPct: 18 }] });
  assert.equal(r.lines[0].freightInr, 7500); assert.equal(r.lines[1].freightInr, 2500, '75/25 by value');
  assert.equal(r.lines[0].assessableValue, 24000 + 7500); assert.equal(r.lines[0].landingChargeInr, 0);
  assert.ok(Math.abs(r.lines[0].clearanceInr + r.lines[1].clearanceInr - 5000) < 0.011);
  assert.ok(Math.abs(r.totals.landedCost - (r.lines[0].landedCost + r.lines[1].landedCost)) < 0.011);
  assert.equal(r.lines[1].bcd, 0);
}
assert.throws(() => computeImportLandedCost({ currency: 'USD', exchangeRate: 0, freightInr: 0, insuranceInr: 0, lines: [{ description: 'x', quantity: 1, unitPrice: 1, bcdPct: 0, swsPct: 0, igstPct: 0 }] }), /exchange rate/);
assert.throws(() => computeImportLandedCost({ currency: 'USD', exchangeRate: 80, freightInr: 0, insuranceInr: 0, lines: [] }), /at least one/);
assert.throws(() => computeImportLandedCost({ currency: 'USD', exchangeRate: 80, freightInr: 0, insuranceInr: 0, lines: [{ description: 'x', quantity: 0, unitPrice: 1, bcdPct: 0, swsPct: 0, igstPct: 0 }] }), /quantity/);
assert.throws(() => computeImportLandedCost({ currency: 'USD', exchangeRate: 80, freightInr: 0, insuranceInr: 0, lines: [{ description: 'x', quantity: 1, unitPrice: 1, bcdPct: 1000, swsPct: 0, igstPct: 0 }] }), /BCD/);
{ const r = computeImportLandedCost({ currency: 'USD', exchangeRate: 80, freightInr: 0, insuranceInr: 0, lines: [{ description: 'x', quantity: 1, unitPrice: 1, bcdPct: 0, swsPct: 0, igstPct: 0 }] });
  assert.ok(r.warnings.some((w) => /No customs duty/.test(w)) && r.warnings.some((w) => /0% IGST/.test(w)) && r.warnings.some((w) => /No freight or insurance/.test(w))); }

// ── QC & production ─────────────────────────────────────────────────────────
{
  assert.equal(qcVerdict({ sampleSize: 200, defects: [{ severity: 'minor', count: 8 }, { severity: 'major', count: 5 }], aqlMajor: 2.5, aqlMinor: 4 }).result, 'pass', '2.5% major, 4% minor are AT the limit');
  const f = qcVerdict({ sampleSize: 200, defects: [{ severity: 'major', count: 6 }], aqlMajor: 2.5, aqlMinor: 4 });
  assert.equal(f.result, 'fail'); assert.equal(f.majorPct, 3); assert.match(f.reasons[0], /Major defects 3%/);
  const c = qcVerdict({ sampleSize: 1000, defects: [{ severity: 'critical', count: 1 }], aqlMajor: 2.5, aqlMinor: 4 });
  assert.equal(c.result, 'fail', 'one critical defect fails regardless of rate'); assert.match(c.reasons[0], /critical/);
  assert.equal(qcVerdict({ sampleSize: 50, defects: [], aqlMajor: 0, aqlMinor: 0 }).result, 'pass');
  assert.equal(qcVerdict({ sampleSize: 50, defects: [{ severity: 'minor', count: 1 }, { severity: 'minor', count: 2 }], aqlMajor: 0, aqlMinor: 5 }).minor, 3, 'defect rows are summed');
  assert.throws(() => qcVerdict({ sampleSize: 0, defects: [], aqlMajor: 1, aqlMinor: 1 }), /Sample size/);
  assert.throws(() => qcVerdict({ sampleSize: 1.5, defects: [], aqlMajor: 1, aqlMinor: 1 }), /whole number/);
}
{
  const now = d('2026-10-15');
  const stages = [{ name: 'Cutting', plannedAt: d('2026-10-01'), completedAt: d('2026-10-02') }, { name: 'Stitching', plannedAt: d('2026-10-10'), completedAt: null }, { name: 'Packing', plannedAt: d('2026-10-20'), completedAt: null }];
  const p = runProgress({ stages, plannedQty: 1000, producedQty: 400, dueDate: d('2026-10-30'), completed: false, now });
  assert.equal(p.stagesDone, 1); assert.equal(p.stagePct, 33.33); assert.equal(p.qtyPct, 40); assert.deepEqual(p.lateStages, ['Stitching']); assert.equal(p.status, 'at_risk'); assert.equal(p.daysLate, 0);
  assert.equal(runProgress({ stages, plannedQty: 1000, producedQty: 400, dueDate: d('2026-10-10'), completed: false, now }).status, 'late');
  assert.equal(runProgress({ stages, plannedQty: 1000, producedQty: 400, dueDate: d('2026-10-10'), completed: false, now }).daysLate, 5);
  assert.equal(runProgress({ stages: [], plannedQty: 100, producedQty: 150, dueDate: null, completed: false, now }).qtyPct, 100, 'over-production caps at 100');
  assert.equal(runProgress({ stages, plannedQty: 1000, producedQty: 1000, dueDate: d('2026-10-01'), completed: true, now }).status, 'done');
  assert.equal(runProgress({ stages: [], plannedQty: 0, producedQty: 0, dueDate: null, completed: false, now }).status, 'on_track');
}

// ── Accountant export ───────────────────────────────────────────────────────
assert.equal(csvCell('plain'), 'plain'); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""'); assert.equal(csvCell(null), ''); assert.equal(csvCell(12.5), '12.5');
assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"', 'formula injection neutralised'); assert.equal(csvCell('+91 98765'), "'+91 98765"); assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
assert.equal(csvCell(-5), '-5', 'negative numbers are not mistaken for formulas'); assert.equal(csvCell('-5.25'), '-5.25');
assert.equal(xmlEscape(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;'); assert.equal(xmlEscape('a\u0001b'), 'ab', 'control chars stripped');
const inv = (o: Record<string, unknown> = {}) => ({ invoiceNumber: 'INV-1', createdAt: d('2026-10-05'), dueDate: d('2026-11-05'), currency: 'INR', total: 1000, status: 'sent', isCreditOrDebitNote: false, noteKind: null, buyerName: 'Acme & Sons', ...o }) as Parameters<typeof accountantCsv>[0][number];
{
  const csv = accountantCsv([inv(), inv({ invoiceNumber: 'CN-1', isCreditOrDebitNote: true, noteKind: 'credit', total: 200 }), inv({ invoiceNumber: 'DN-1', isCreditOrDebitNote: true, noteKind: 'debit', total: 50 }), inv({ invoiceNumber: 'D', status: 'draft' })],
    [{ billNumber: 'B-1', billDate: d('2026-10-01'), currency: 'INR', total: 300, status: 'open', vendorName: 'Yarn Co' }, { billNumber: 'B-2', billDate: d('2026-10-01'), currency: 'INR', total: 1, status: 'void', vendorName: 'x' }]);
  const rows = csv.trim().split('\r\n');
  assert.equal(rows.length, 5, 'header + invoice + credit + debit + bill; drafts and voids omitted');
  assert.match(rows[1], /^Sales invoice,INV-1,2026-10-05,2026-11-05,Acme & Sons,INR,1000.00,sent$/); assert.match(rows[2], /Credit note,CN-1.*,-200.00,/); assert.match(rows[3], /Debit note,DN-1.*,50.00,/); assert.match(rows[4], /Purchase bill,B-1.*,-300.00,/);
}
{
  const r = tallyVouchersXml(
    [inv({ buyerName: 'Acme & <Sons>' }), inv({ invoiceNumber: 'USD-1', currency: 'USD', total: 100 }), inv({ invoiceNumber: 'GBP-1', currency: 'GBP', total: 100 }), inv({ invoiceNumber: 'CN-1', isCreditOrDebitNote: true, noteKind: 'credit', total: 200 }), inv({ invoiceNumber: 'NB', buyerName: null })],
    [{ billNumber: 'B-1', billDate: d('2026-10-01'), currency: 'INR', total: 300, status: 'open', vendorName: 'Yarn Co' }],
    { company: 'My Co & Sons', baseCurrency: 'INR', rates: { INR: 1, USD: 80 } });
  assert.equal(r.exported, 4); assert.deepEqual(r.skipped.map((s) => s.number).sort(), ['GBP-1', 'NB']);
  assert.match(r.skipped.find((s) => s.number === 'GBP-1')!.reason, /No exchange rate for GBP/);
  assert.ok(r.xml.startsWith('<?xml') && r.xml.includes('<SVCURRENTCOMPANY>My Co &amp; Sons</SVCURRENTCOMPANY>'));
  assert.ok(r.xml.includes('Acme &amp; &lt;Sons&gt;') && !r.xml.includes('Acme & <Sons>'), 'party names escaped');
  assert.ok(r.xml.includes('<VOUCHERNUMBER>USD-1</VOUCHERNUMBER>') && r.xml.includes('<AMOUNT>-8000.00</AMOUNT>'), 'USD 100 at ₹80 → debit party ₹8,000');
  // Sales: party debited (negative, deemed positive), income credited
  const sales = r.xml.match(/<VOUCHER VCHTYPE="Sales"[\s\S]*?<\/VOUCHER>/)![0];
  assert.ok(/<LEDGERNAME>Acme[^<]*<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-1000.00<\/AMOUNT>/.test(sales) && /<LEDGERNAME>Export Sales<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>1000.00<\/AMOUNT>/.test(sales));
  const cn = r.xml.match(/<VOUCHER VCHTYPE="Credit Note"[\s\S]*?<\/VOUCHER>/)![0];
  assert.ok(/Export Sales<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-200.00<\/AMOUNT>/.test(cn), 'credit note reverses the sale');
  const pu = r.xml.match(/<VOUCHER VCHTYPE="Purchase"[\s\S]*?<\/VOUCHER>/)![0];
  assert.ok(/Purchases<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-300.00<\/AMOUNT>/.test(pu) && /<DATE>20261001<\/DATE>/.test(pu));
  // every voucher balances to zero
  for (const v of r.xml.match(/<VOUCHER [\s\S]*?<\/VOUCHER>/g)!) { const amts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1])); assert.equal(Math.round(amts.reduce((s, x) => s + x, 0) * 100), 0, 'debits equal credits'); }
}

// ── Cadence ─────────────────────────────────────────────────────────────────
assert.deepEqual(parseCadence(undefined), DEFAULT_CADENCE); assert.deepEqual(parseCadence('nope'), DEFAULT_CADENCE); assert.deepEqual(parseCadence([]), DEFAULT_CADENCE);
assert.deepEqual(parseCadence([{ afterDays: 10, kind: 'requote' }, { afterDays: 2, kind: 'nudge' }, { afterDays: 2, kind: 'requote' }, { afterDays: -1, kind: 'nudge' }, { afterDays: 5, kind: 'spam' }, { afterDays: 9999, kind: 'nudge' }, null, 'x']), [{ afterDays: 2, kind: 'nudge' }, { afterDays: 10, kind: 'requote' }], 'sorted, deduped, malformed dropped');
{
  const anchor = d('2026-10-01');
  assert.equal(dueCadenceStep({ anchor, stepsDone: 0, now: d('2026-10-03') }), null, 'day 2: not yet');
  const s0 = dueCadenceStep({ anchor, stepsDone: 0, now: d('2026-10-04') })!; assert.equal(s0.step.kind, 'nudge'); assert.equal(s0.overdueDays, 0);
  const late = dueCadenceStep({ anchor, stepsDone: 0, now: d('2026-11-10') })!; assert.equal(late.index, 0, 'a long-quiet lead gets the EARLIEST unhandled step, not a burst'); assert.equal(late.overdueDays, 37);
  assert.equal(dueCadenceStep({ anchor, stepsDone: 1, now: d('2026-10-07') }), null, 'day 6: re-quote not yet due (steps are measured from the anchor)');
  assert.equal(dueCadenceStep({ anchor, stepsDone: 1, now: d('2026-10-08') })!.step.kind, 'requote');
  assert.equal(dueCadenceStep({ anchor, stepsDone: 3, now: d('2027-12-01') }), null, 'cadence exhausted');
  assert.equal(dueCadenceStep({ anchor, stepsDone: 0, now: d('2026-12-01'), stop: true }), null, 'replied/won/lost stops it');
}

// ── WhatsApp window ─────────────────────────────────────────────────────────
{
  const now = new Date('2026-10-05T12:00:00Z');
  assert.equal(sessionWindow(null, now).open, false);
  assert.equal(sessionWindow(new Date('2026-10-04T13:00:00Z'), now).open, true); assert.equal(sessionWindow(new Date('2026-10-04T13:00:00Z'), now).msLeft, 60 * 60 * 1000);
  assert.equal(sessionWindow(new Date('2026-10-04T12:00:00Z'), now).open, false, 'exactly 24h ago is closed');
  assert.equal(sessionWindow(new Date('2026-10-04T11:59:59Z'), now).open, false);
  assert.equal(sessionWindow(new Date('2026-10-06T12:00:00Z'), now).msLeft, SESSION_WINDOW_MS, 'a future timestamp cannot extend the window');
  assert.equal(sendModeFor(new Date('2026-10-05T11:00:00Z'), now), 'session'); assert.equal(sendModeFor(null, now), 'template_only');
}

// ── RoDTEP estimate ─────────────────────────────────────────────────────────
{
  const e = estimateRodtep({ fobValue: 10000, currency: 'USD', ratePct: 1.4, rates: { INR: 1, USD: 80 }, rateIsAiEstimate: false });
  assert.equal(e.amountInr, 11200); assert.equal(e.fobValueInr, 800000); assert.ok(e.problems.some((p) => /caps/.test(p)) && !e.problems.some((p) => /AI estimate/.test(p)));
  assert.ok(estimateRodtep({ fobValue: 1, currency: 'INR', ratePct: 2, rates: { INR: 1 }, rateIsAiEstimate: true }).problems.some((p) => /AI estimate/.test(p)));
  assert.equal(estimateRodtep({ fobValue: 1, currency: 'USD', ratePct: 2, rates: { INR: 1 }, rateIsAiEstimate: false }).amountInr, null); assert.ok(estimateRodtep({ fobValue: 1, currency: 'USD', ratePct: 2, rates: { INR: 1 }, rateIsAiEstimate: false }).problems.some((p) => /exchange rate/.test(p)));
  assert.equal(estimateRodtep({ fobValue: 100, currency: 'INR', ratePct: null, rates: { INR: 1 }, rateIsAiEstimate: false }).amountInr, null);
  const wild = estimateRodtep({ fobValue: 100, currency: 'INR', ratePct: 40, rates: { INR: 1 }, rateIsAiEstimate: true }); assert.equal(wild.amountInr, null, 'an implausible rate yields no figure'); assert.ok(wild.problems.some((p) => /above any published/.test(p)));
  assert.equal(estimateRodtep({ fobValue: 100, currency: 'INR', ratePct: 0, rates: { INR: 1 }, rateIsAiEstimate: false }).amountInr, 0);
}

// ── Invite tokens ───────────────────────────────────────────────────────────
{
  const t = generateInviteToken(); const t2 = generateInviteToken();
  assert.equal(t.length, 32); assert.ok(looksLikeInviteToken(t)); assert.notEqual(t, t2);
  const h = hashInviteToken(t); assert.equal(h.length, 64); assert.notEqual(h, t);
  assert.equal(tokenMatches(t, h), true); assert.equal(tokenMatches(t2, h), false); assert.equal(tokenMatches(t, 'short'), false); assert.equal(tokenMatches('x'.repeat(32), h), false);
  for (const bad of ['', 'a'.repeat(31), 'a'.repeat(33), 'a'.repeat(31) + '!', '../etc/passwd'.padEnd(32, 'a')]) assert.equal(looksLikeInviteToken(bad), false);
  const now = d('2026-10-05');
  assert.deepEqual(inviteUsable({ tokenExpiresAt: inviteExpiry(now), now, rfqOpen: true }), { ok: true });
  assert.equal(inviteUsable({ tokenExpiresAt: inviteExpiry(now), now, rfqOpen: false }).ok, false);
  assert.match(inviteUsable({ tokenExpiresAt: d('2026-10-05'), now, rfqOpen: true }).reason!, /expired/);
  assert.match(inviteUsable({ tokenExpiresAt: null, now, rfqOpen: true }).reason!, /not active/);
  assert.equal(inviteExpiry(now).toISOString().slice(0, 10), '2026-10-19');
}

console.log('✓ v3: LC presentation, import landed cost, QC/production, accountant export, cadence, WhatsApp window, RoDTEP, invite tokens');
