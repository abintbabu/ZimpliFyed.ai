import assert from 'node:assert/strict';
import { parseCsv, parseStatementDate, parseAmount, parseBankStatement, lineFingerprint, suggestMatch } from '../../lib/bank-reconcile';
import { companyPnl } from '../../lib/company-pnl';
import { fxExposure } from '../../lib/fx-exposure';
import { realizationClock, addMonthsClamped } from '../../lib/realization-clock';
import { explainMarginGap, LEAK_FLAG_PTS } from '../../lib/margin-leak';
import { planReporting } from '../../lib/fx';

/** Finance engines (pure): `npm run test:finance`. */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// ── CSV ─────────────────────────────────────────────────────────────────────
assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']], 'semicolon delimiter detected');
assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
assert.deepEqual(parseCsv('﻿a,b\n\n1,2\n\n'), [['a', 'b'], ['1', '2']], 'BOM and blank lines');
assert.deepEqual(parseCsv('a,b\n"multi\nline",2'), [['a', 'b'], ['multi\nline', '2']]);

// ── Dates & amounts ─────────────────────────────────────────────────────────
assert.equal(parseStatementDate('05/10/2026')!.toISOString(), '2026-10-05T00:00:00.000Z', 'dd/mm/yyyy');
assert.equal(parseStatementDate('5-10-26')!.toISOString(), '2026-10-05T00:00:00.000Z', 'dd-mm-yy');
assert.equal(parseStatementDate('05-Oct-2026')!.toISOString(), '2026-10-05T00:00:00.000Z');
assert.equal(parseStatementDate('5 October 2026')!.toISOString(), '2026-10-05T00:00:00.000Z');
assert.equal(parseStatementDate('2026-10-05')!.toISOString(), '2026-10-05T00:00:00.000Z');
assert.equal(parseStatementDate('31/02/2026'), null, 'impossible date');
assert.equal(parseStatementDate('13/13/2026'), null); assert.equal(parseStatementDate('soon'), null);
assert.equal(parseAmount('1,23,456.78'), 123456.78); assert.equal(parseAmount('(500.00)'), -500); assert.equal(parseAmount('500.00 Dr'), -500); assert.equal(parseAmount('500 Cr'), 500);
assert.equal(parseAmount('₹ 1,000'), 1000); assert.equal(parseAmount('-25'), -25); assert.equal(parseAmount(''), null); assert.equal(parseAmount('abc'), null); assert.equal(parseAmount('--5'), null);

// ── Statement parsing ───────────────────────────────────────────────────────
{
  const csv = [
    'Account Statement,,,,',
    'Branch: Chennai,,,,',
    'Txn Date,Value Date,Narration,Chq/Ref No,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    '01/10/2026,01/10/2026,NEFT-ACME GMBH-INV-2026-0042,UTR123,,"1,25,000.00","5,25,000.00"',
    '02/10/2026,02/10/2026,"RENT, OCTOBER",CHQ889,"30,000.00",,"4,95,000.00"',
    'bad date,x,Something,,100,,',
    '03/10/2026,03/10/2026,No amount,,,,',
    ',,,,,,',
  ].join('\n');
  const r = parseBankStatement(csv);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines[0], { txnDate: d('2026-10-01'), narration: 'NEFT-ACME GMBH-INV-2026-0042', reference: 'UTR123', amount: 125000, balance: 525000 });
  assert.equal(r.lines[1].amount, -30000, 'withdrawals are negative'); assert.equal(r.lines[1].narration, 'RENT, OCTOBER');
  assert.deepEqual(r.errors.map((e) => e.row), [6, 7], 'bad rows reported by 1-based row number; blank trailer ignored');
  assert.match(r.errors[0].message, /date/); assert.match(r.errors[1].message, /amount/);
}
{ // single signed Amount column
  const r = parseBankStatement('Date,Description,Amount\n05/10/2026,Receipt,500.5\n06/10/2026,Fee,-12');
  assert.deepEqual(r.lines.map((l) => l.amount), [500.5, -12]);
}
assert.match(parseBankStatement('foo,bar\n1,2').errors[0].message, /header/);
assert.equal(parseBankStatement('').lines.length, 0);

// ── Fingerprint ─────────────────────────────────────────────────────────────
{
  const a = lineFingerprint({ txnDate: d('2026-10-01'), narration: 'NEFT ACME', amount: 100, balance: 500 });
  assert.equal(a, lineFingerprint({ txnDate: d('2026-10-01'), narration: 'neft acme', amount: 100.0, balance: 500 }), 'case-insensitive, stable');
  assert.notEqual(a, lineFingerprint({ txnDate: d('2026-10-01'), narration: 'NEFT ACME', amount: 100, balance: 600 }), 'running balance distinguishes identical same-day lines');
  assert.equal(a.length, 32);
}

// ── Matching ────────────────────────────────────────────────────────────────
const inv = (id: string, number: string, amount: number, currency = 'INR', party: string | null = null) => ({ id, number, amount, currency, party });
{
  const cands = [inv('1', 'INV-2026-0042', 125000, 'INR', 'Meridian Home GmbH'), inv('2', 'INV-2026-0043', 125000, 'INR'), inv('3', 'INV-2026-0099', 5000)];
  const m = suggestMatch({ narration: 'NEFT-MERIDIAN-INV20260042', reference: null, amount: 125000 }, cands)!;
  assert.equal(m.candidateId, '1'); assert.equal(m.confidence, 'high'); assert.ok(m.reasons.some((r) => /contains/.test(r)) && m.reasons.some((r) => /amount equals/.test(r)));
  // number alone (foreign invoice, INR credit at the bank's rate) → medium
  const f = suggestMatch({ narration: 'FIRC INV-2026-0050 BUYER', reference: null, amount: 1_050_000 }, [inv('9', 'INV-2026-0050', 12500, 'USD')])!;
  assert.equal(f.candidateId, '9'); assert.equal(f.confidence, 'medium'); assert.ok(!f.reasons.some((r) => /amount/.test(r)), 'amounts in different currencies are never compared');
  // amount only, two identical candidates → still a suggestion, but only low confidence
  const a = suggestMatch({ narration: 'NEFT unknown payer', reference: null, amount: 125000 }, [inv('1', 'X-1', 125000), inv('2', 'X-2', 125000)])!;
  assert.equal(a.confidence, 'low');
  // reference column participates
  assert.equal(suggestMatch({ narration: 'payment', reference: 'INV-2026-0043', amount: 1 }, cands)!.candidateId, '2');
  // no signal → null; part payment alone is not a signal; a name alone is not a signal
  assert.equal(suggestMatch({ narration: 'random', reference: null, amount: 777 }, cands), null);
  assert.equal(suggestMatch({ narration: 'random', reference: null, amount: 100 }, [inv('1', 'INV-1-ABC', 5000)]), null);
  assert.equal(suggestMatch({ narration: 'Meridian Home payment', reference: null, amount: 12 }, [inv('1', 'ZZZ-9999', 500, 'INR', 'Meridian Home GmbH')]), null);
  // short invoice numbers can't be matched by substring (too many false positives)
  assert.equal(suggestMatch({ narration: 'ref 123 paid', reference: null, amount: 9 }, [inv('1', '123', 1000)]), null);
  assert.equal(suggestMatch({ narration: 'x', reference: null, amount: 1 }, []), null);
}

// ── Company P&L ─────────────────────────────────────────────────────────────
{
  const plan = planReporting(['INR'], {});
  const now = d('2026-10-15');
  const r = companyPnl({
    now, months: 3, plan,
    invoices: [
      { total: 10000, currency: 'INR', status: 'sent', createdAt: d('2026-10-02'), isCreditOrDebitNote: false },
      { total: 1500, currency: 'INR', status: 'sent', createdAt: d('2026-10-09'), isCreditOrDebitNote: true, noteKind: 'credit' },
      { total: 5000, currency: 'INR', status: 'paid', createdAt: d('2026-08-20'), isCreditOrDebitNote: false },
      { total: 999, currency: 'INR', status: 'draft', createdAt: d('2026-10-02'), isCreditOrDebitNote: false },
    ],
    expenses: [{ amount: 700, currency: null, date: d('2026-10-03') }, { amount: 50, currency: 'INR', date: d('2025-01-01') }],
    bills: [{ total: 3000, currency: 'INR', billDate: d('2026-09-10'), status: 'open' }, { total: 9, currency: 'INR', billDate: d('2026-09-10'), status: 'void' }],
  });
  assert.deepEqual(r.months.map((m) => m.month), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(r.months.map((m) => [m.revenue, m.expenses, m.vendorBills, m.operatingProfit]), [[5000, 0, 0, 5000], [0, 0, 3000, -3000], [8500, 700, 0, 7800]]);
  assert.equal(r.totals.revenue, 13500); assert.equal(r.totals.operatingProfit, 9800); assert.equal(r.totals.marginPct, 72.59);
  assert.ok(r.notes.some((n) => /counted twice/.test(n)));
}
{ // unconvertible currency excluded and counted; no revenue → null margin
  const plan = planReporting(['INR', 'USD'], { INR: 1 });
  const r = companyPnl({ now: d('2026-10-15'), months: 1, plan, invoices: [{ total: 100, currency: 'USD', status: 'sent', createdAt: d('2026-10-01'), isCreditOrDebitNote: false }], expenses: [], bills: [] });
  assert.equal(r.excludedCount, 1); assert.equal(r.totals.marginPct, null);
}

// ── FX exposure ─────────────────────────────────────────────────────────────
{
  const e = fxExposure({
    receivables: [{ currency: 'usd', amount: 10000 }, { currency: 'USD', amount: 5000 }, { currency: 'EUR', amount: 2000 }, { currency: 'INR', amount: 999999 }, { currency: 'GBP', amount: 100 }],
    payables: [{ currency: 'USD', amount: 3000 }, { currency: 'JPY', amount: 50000 }],
    rates: { INR: 1, USD: 80, EUR: 90, JPY: 0.55 }, baseCurrency: 'INR',
  });
  const by = Object.fromEntries(e.rows.map((r) => [r.currency, r]));
  assert.equal(by.USD.net, 12000); assert.equal(by.USD.netBase, 960000); assert.equal(by.USD.adverse5, -48000); assert.equal(by.USD.adverse10, -96000);
  assert.equal(by.JPY.net, -50000, 'a payable is a short position'); assert.equal(by.JPY.netBase, -27500); assert.equal(by.JPY.adverse5, -1375);
  assert.ok(!('INR' in by), 'base currency has no FX exposure');
  assert.deepEqual(e.unvalued, ['GBP']); assert.equal(by.GBP.netBase, null);
  assert.equal(e.totalNetBase, 960000 + 180000 - 27500);
  assert.deepEqual(e.rows.map((r) => r.currency)[0], 'USD', 'largest exposure first');
}

// ── Realisation clock ───────────────────────────────────────────────────────
assert.equal(addMonthsClamped(d('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28', 'clamps to month end');
assert.equal(addMonthsClamped(d('2024-01-31'), 1).toISOString().slice(0, 10), '2024-02-29', 'leap year');
assert.equal(addMonthsClamped(d('2026-03-15'), 9).toISOString().slice(0, 10), '2026-12-15');
assert.equal(addMonthsClamped(d('2026-06-30'), 9).toISOString().slice(0, 10), '2027-03-30');
{
  const now = d('2026-10-05');
  const base = { invoiceTotal: 10000, realized: 0, now };
  const open = realizationClock({ ...base, exportDate: d('2026-06-01') });
  assert.equal(open.status, 'open'); assert.equal(open.deadline!.toISOString().slice(0, 10), '2027-03-01'); assert.equal(open.daysLeft, 147);
  assert.equal(realizationClock({ ...base, exportDate: d('2026-01-20') }).status, 'due_soon', 'deadline 20 Oct → 15 days');
  assert.equal(realizationClock({ ...base, exportDate: d('2026-01-05') }).daysLeft, 0);
  assert.equal(realizationClock({ ...base, exportDate: d('2026-01-04') }).status, 'overdue');
  assert.equal(realizationClock({ ...base, exportDate: d('2025-12-01') }).daysLeft, -34, '1 Dec + 9 months = 1 Sep, 34 days before 5 Oct');
  assert.equal(realizationClock({ ...base, realized: 10000, exportDate: d('2025-01-01') }).status, 'realized', 'fully realised never reads overdue');
  const part = realizationClock({ ...base, realized: 4000, exportDate: d('2026-06-01') });
  assert.equal(part.outstanding, 6000); assert.equal(part.realizedPct, 40);
  assert.equal(realizationClock({ ...base, exportDate: null }).status, 'unknown');
  assert.equal(realizationClock({ ...base, exportDate: d('2026-06-01'), months: 15 }).deadline!.toISOString().slice(0, 10), '2027-09-01', 'period is a parameter');
  assert.equal(realizationClock({ invoiceTotal: 0, realized: 0, exportDate: d('2026-06-01'), now }).status, 'open', 'a zero invoice is not "realised"');
}

// ── Margin leak ─────────────────────────────────────────────────────────────
{
  const r = explainMarginGap({ quotedRevenue: 10000, quotedCost: 6000, grossInvoiced: 10000, creditNotes: 800, debitNotes: 0, actualCost: 6500, bookedExpenses: 400, incentives: 200 });
  assert.equal(r.quotedProfit, 4000); assert.equal(r.actualProfit, 10000 - 800 + 200 - 6500 - 400); // 2500
  assert.equal(r.gap, 1500);
  assert.equal(r.leaks.reduce((s, l) => s + l.amount, 0), r.gap, 'components add up EXACTLY to the gap');
  assert.deepEqual(r.leaks.map((l) => [l.key, l.amount]), [['cost_overrun', 500], ['credit_notes', 800], ['expenses', 400], ['incentives', -200]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  assert.equal(r.leaks[0].key, 'credit_notes', 'biggest driver first'); assert.equal(r.leaks[r.leaks.length - 1].key, 'incentives', 'recoveries last');
  assert.equal(r.quotedMarginPct, 40); assert.equal(r.actualMarginPct, 27.17); assert.equal(r.gapPts, 12.83); assert.equal(r.flagged, true);
}
{ // clean order: nothing leaked
  const r = explainMarginGap({ quotedRevenue: 1000, quotedCost: 600, grossInvoiced: 1000, creditNotes: 0, debitNotes: 0, actualCost: 600, bookedExpenses: 0, incentives: 0 });
  assert.equal(r.gap, 0); assert.deepEqual(r.leaks, []); assert.equal(r.flagged, false); assert.equal(r.gapPts, 0);
}
{ // debit note recovers; billing less than quoted leaks
  const r = explainMarginGap({ quotedRevenue: 1000, quotedCost: 600, grossInvoiced: 900, creditNotes: 0, debitNotes: 100, actualCost: 600, bookedExpenses: 0, incentives: 0 });
  assert.equal(r.gap, 0); assert.deepEqual(r.leaks.map((l) => l.key).sort(), ['debit_notes', 'unbilled']);
  assert.equal(r.leaks.reduce((s, l) => s + l.amount, 0), 0);
}
{ // nothing invoiced yet → margins are null, no false flag
  const r = explainMarginGap({ quotedRevenue: 1000, quotedCost: 600, grossInvoiced: 0, creditNotes: 0, debitNotes: 0, actualCost: 600, bookedExpenses: 0, incentives: 0 });
  assert.equal(r.actualMarginPct, null); assert.equal(r.gapPts, null); assert.equal(r.flagged, false);
}
assert.equal(LEAK_FLAG_PTS, 5);

console.log('✓ finance: bank statement parse + match, company P&L, FX exposure, realisation clock, margin leak');
