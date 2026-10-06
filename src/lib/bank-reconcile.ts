// Bank statement import & matching (V2). Pure — no DB, no clock.
//
// Parses the CSV an Indian bank lets you download, and proposes which open invoice (credits) or bill (debits)
// each line settles. It only ever PROPOSES: a human confirms every match, because a wrong auto-match silently
// marks money as received. A foreign-currency invoice is usually credited in INR at the bank's rate, so amount
// equality is only trusted when the currencies agree; otherwise the invoice number in the narration carries it.

import { createHash } from 'node:crypto';

export type StatementLine = { txnDate: Date; narration: string; reference: string | null; /** credits +, debits − */ amount: number; balance: number | null };

export type ParseResult = { lines: StatementLine[]; errors: { row: number; message: string }[] };

// ── CSV ──────────────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, embedded newlines/commas. Delimiter auto-detected from the header. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const counts: [string, number][] = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length - 1]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ',';

  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parses the date formats Indian statements use. dd/mm is assumed for ambiguous numeric dates. Returns UTC midnight. */
export function parseStatementDate(raw: string): Date | null {
  const s = raw.trim();
  let m: RegExpExecArray | null;
  let y: number, mo: number, d: number;
  if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ,]*(\d{2,4})$/.exec(s))) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = +m[3]; if (mo == null) return null; }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) { d = +m[1]; mo = +m[2] - 1; y = +m[3]; }
  else return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo && dt.getUTCDate() === d ? dt : null;
}

/** "1,23,456.78", "(500.00)", "500.00 Dr", "₹ 1,000" → signed number. Dr/negative → −. Empty → null. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\bdr\.?$/i.test(s)) { neg = true; s = s.replace(/\bdr\.?$/i, ''); }
  else if (/\bcr\.?$/i.test(s)) s = s.replace(/\bcr\.?$/i, '');
  s = s.replace(/[₹$€£,\s]/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

type Cols = { date: number; narration: number; debit: number; credit: number; amount: number; balance: number; ref: number };

function detectColumns(header: string[]): Cols | null {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h.toLowerCase()));
  const cols: Cols = {
    date: find(/^(txn|transaction|value|posting)?\s*date$|^date$/),
    narration: find(/narration|description|particulars|details|remarks/),
    debit: find(/debit|withdrawal|dr\b/),
    credit: find(/credit|deposit|cr\b/),
    amount: find(/^amount|txn amount|transaction amount/),
    balance: find(/balance/),
    ref: find(/ref|chq|cheque|utr|instrument/),
  };
  if (cols.date < 0 || cols.narration < 0) return null;
  if (cols.amount < 0 && cols.debit < 0 && cols.credit < 0) return null;
  return cols;
}

export function parseBankStatement(text: string): ParseResult {
  const rows = parseCsv(text);
  const errors: ParseResult['errors'] = [];
  // Statements often carry a preamble — the header is the first row that looks like one.
  let hi = -1, cols: Cols | null = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) { const c = detectColumns(rows[i]); if (c) { hi = i; cols = c; break; } }
  if (!cols) return { lines: [], errors: [{ row: 0, message: 'Could not find a header with a date, a narration and an amount (or debit/credit) column.' }] };

  const lines: StatementLine[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 1;
    const dateRaw = r[cols.date] ?? '';
    if (!dateRaw) continue; // totals / blank trailer rows
    const txnDate = parseStatementDate(dateRaw);
    if (!txnDate) { errors.push({ row: rowNo, message: `Unrecognised date "${dateRaw}".` }); continue; }

    let amount: number | null = null;
    if (cols.debit >= 0 || cols.credit >= 0) {
      const deb = cols.debit >= 0 ? parseAmount(r[cols.debit] ?? '') : null;
      const cre = cols.credit >= 0 ? parseAmount(r[cols.credit] ?? '') : null;
      if (cre != null && cre !== 0) amount = Math.abs(cre);
      else if (deb != null && deb !== 0) amount = -Math.abs(deb);
    }
    if (amount == null && cols.amount >= 0) amount = parseAmount(r[cols.amount] ?? '');
    if (amount == null || amount === 0) { errors.push({ row: rowNo, message: 'No debit/credit amount.' }); continue; }

    lines.push({
      txnDate,
      narration: (r[cols.narration] ?? '').replace(/\s+/g, ' ').trim(),
      reference: cols.ref >= 0 ? (r[cols.ref] ?? '').trim() || null : null,
      amount: Math.round(amount * 100) / 100,
      balance: cols.balance >= 0 ? parseAmount(r[cols.balance] ?? '') : null,
    });
  }
  return { lines, errors };
}

/** Stable identity for a statement line — re-importing the same file creates nothing new. */
export function lineFingerprint(l: Pick<StatementLine, 'txnDate' | 'narration' | 'amount' | 'balance'>): string {
  const key = [l.txnDate.toISOString().slice(0, 10), l.narration.toLowerCase(), l.amount.toFixed(2), l.balance == null ? '' : l.balance.toFixed(2)].join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

// ── Matching ─────────────────────────────────────────────────────────────────

export type MatchCandidate = { id: string; number: string; /** Outstanding amount. */ amount: number; currency: string; party: string | null };

export type MatchSuggestion = { candidateId: string; confidence: 'high' | 'medium' | 'low'; reasons: string[] };

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Best candidate for one statement line, or null. `lineCurrency` is the account currency (INR for most
 * Indian accounts). Needs a real signal — an invoice number in the narration, or an exact amount in the
 * same currency — before suggesting anything.
 */
export function suggestMatch(line: Pick<StatementLine, 'narration' | 'reference' | 'amount'>, candidates: MatchCandidate[], lineCurrency = 'INR'): MatchSuggestion | null {
  const hay = alnum(`${line.narration} ${line.reference ?? ''}`);
  const abs = Math.abs(line.amount);
  let best: { score: number; s: MatchSuggestion } | null = null;

  for (const c of candidates) {
    const reasons: string[] = [];
    let score = 0;
    const num = alnum(c.number);
    if (num.length >= 4 && hay.includes(num)) { score += 60; reasons.push(`narration contains ${c.number}`); }
    const sameCur = c.currency.toUpperCase() === lineCurrency.toUpperCase();
    if (sameCur) {
      if (Math.abs(c.amount - abs) < 0.01) { score += 35; reasons.push('amount equals the outstanding balance'); }
      else if (abs < c.amount) { score += 5; reasons.push('part-payment of the balance'); }
    }
    const partyTokens = (c.party ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    if (partyTokens.length && partyTokens.some((t) => hay.includes(t))) { score += 10; reasons.push(`narration mentions ${c.party}`); }

    // A bare "part-payment" or name hit is not evidence on its own.
    const hasSignal = reasons.some((r) => r.startsWith('narration contains') || r.startsWith('amount equals'));
    if (!hasSignal) continue;
    if (!best || score > best.score) best = { score, s: { candidateId: c.id, confidence: 'low', reasons } };
  }
  if (!best) return null;
  best.s.confidence = best.score >= 90 ? 'high' : best.score >= 60 ? 'medium' : 'low';
  return best.s;
}
