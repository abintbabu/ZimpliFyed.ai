import type { DocModel, DocType, InvoiceBody, PackingBody } from './models';

/**
 * Deterministic cross-document rule engine (DOC_ENGINE_SPEC §2, build step 3).
 *
 * Pure functions over the full DocModel[] of a set — cheap, run before the AI pass, exact-match tested by
 * the golden harness. Each rule is `{ id, severity, docs, check, message }` and returns zero or more
 * findings. Rules catch what arithmetic and identity comparison can catch; the AI pass (Sprint 3) catches
 * meaning-level issues rules can't. India-pack specifics live behind `packId` so the core stays neutral.
 */

export type Severity = 'error' | 'warning';

export type Finding = {
  ruleId: string;
  severity: Severity;
  docTypes: DocType[];
  message: string;
  /** Optional field path for the fix-list UI, e.g. "commercial_invoice.total". */
  field?: string;
  /** Where the finding came from. Deterministic rules omit this (treated as 'rule'); the AI pass sets 'ai'. */
  source?: 'rule' | 'ai';
  /** AI-pass only: a suggested correction the human can accept (§3). The AI never edits documents itself. */
  suggestion?: string;
};

type Rule = {
  id: string;
  severity: Severity;
  /** Doc types this rule needs present to run at all. */
  requires: DocType[];
  check: (models: Map<DocType, DocModel>) => Finding[];
  packId?: string;
};

const CURRENCY_EPSILON = 0.01;

function invoice(m: DocModel | undefined): (InvoiceBody & { header: DocModel }) | null {
  if (!m) return null;
  if (m.type === 'proforma_invoice' || m.type === 'commercial_invoice') return { ...m.body, header: m };
  return null;
}

function packing(m: DocModel | undefined): PackingBody | null {
  if (!m) return null;
  if (m.type === 'packing_list') return m.body;
  return null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** The core rule set (~pack-neutral invariants + India-pack format rules). */
export const RULES: Rule[] = [
  // ── Totals ────────────────────────────────────────────────────────────────
  {
    id: 'ci_total_equals_line_sum',
    severity: 'error',
    requires: ['commercial_invoice'],
    check: (m) => {
      const ci = invoice(m.get('commercial_invoice'));
      if (!ci) return [];
      const sum = round2(ci.lines.reduce((s, l) => s + l.lineTotal, 0));
      if (Math.abs(sum - ci.total) > CURRENCY_EPSILON) {
        return [finding('ci_total_equals_line_sum', 'error', ['commercial_invoice'],
          `Commercial invoice total (${ci.total}) does not equal the sum of its line items (${sum}).`,
          'commercial_invoice.total')];
      }
      return [];
    },
  },
  {
    id: 'line_total_equals_qty_times_price',
    severity: 'error',
    requires: ['commercial_invoice'],
    check: (m) => {
      const ci = invoice(m.get('commercial_invoice'));
      if (!ci) return [];
      const out: Finding[] = [];
      ci.lines.forEach((l, i) => {
        const expected = round2(l.quantity * l.unitPrice);
        if (Math.abs(expected - l.lineTotal) > CURRENCY_EPSILON) {
          out.push(finding('line_total_equals_qty_times_price', 'error', ['commercial_invoice'],
            `CI line ${i + 1} total (${l.lineTotal}) ≠ quantity × unit price (${expected}).`,
            `commercial_invoice.lines[${i}].lineTotal`));
        }
      });
      return out;
    },
  },
  // ── CI ↔ PL quantity consistency ──────────────────────────────────────────
  {
    id: 'ci_pl_quantity_match',
    severity: 'error',
    requires: ['commercial_invoice', 'packing_list'],
    check: (m) => {
      const ci = invoice(m.get('commercial_invoice'));
      const pl = packing(m.get('packing_list'));
      if (!ci || !pl) return [];
      const out: Finding[] = [];
      if (ci.lines.length !== pl.lines.length) {
        out.push(finding('ci_pl_quantity_match', 'error', ['commercial_invoice', 'packing_list'],
          `Commercial invoice has ${ci.lines.length} line(s) but the packing list has ${pl.lines.length}.`));
        return out;
      }
      ci.lines.forEach((l, i) => {
        if (Math.abs(l.quantity - pl.lines[i].quantity) > CURRENCY_EPSILON) {
          out.push(finding('ci_pl_quantity_match', 'error', ['commercial_invoice', 'packing_list'],
            `Line ${i + 1} quantity differs: CI ${l.quantity} vs packing list ${pl.lines[i].quantity}.`,
            `packing_list.lines[${i}].quantity`));
        }
      });
      return out;
    },
  },
  // ── Identity: currency, incoterm, consignee uniform across the set ─────────
  {
    id: 'currency_uniform',
    severity: 'error',
    requires: ['commercial_invoice'],
    check: (m) => {
      const currencies = new Set([...m.values()].map((d) => d.currency));
      if (currencies.size > 1) {
        return [finding('currency_uniform', 'error', [...m.keys()],
          `Documents disagree on currency: ${[...currencies].join(', ')}.`)];
      }
      return [];
    },
  },
  {
    id: 'incoterm_uniform',
    severity: 'error',
    requires: ['commercial_invoice'],
    check: (m) => {
      const incoterms = new Set([...m.values()].map((d) => d.incoterm.toUpperCase()));
      if (incoterms.size > 1) {
        return [finding('incoterm_uniform', 'error', [...m.keys()],
          `Documents disagree on Incoterm: ${[...incoterms].join(', ')}.`)];
      }
      return [];
    },
  },
  {
    id: 'consignee_uniform',
    severity: 'error',
    requires: ['commercial_invoice', 'packing_list'],
    check: (m) => {
      const buyers = new Set([...m.values()].map((d) => d.buyer.name.trim().toLowerCase()));
      if (buyers.size > 1) {
        return [finding('consignee_uniform', 'error', [...m.keys()],
          `Consignee/buyer name is not identical across all documents.`)];
      }
      return [];
    },
  },
  // ── India pack: format rules ──────────────────────────────────────────────
  {
    id: 'in_iec_format',
    severity: 'error',
    requires: ['commercial_invoice'],
    packId: 'in',
    check: (m) => {
      const ci = m.get('commercial_invoice');
      if (!ci) return [];
      if (!/^[0-9]{10}$/.test(ci.exporter.iecNumber)) {
        return [finding('in_iec_format', 'error', ['commercial_invoice'],
          `IEC number must be exactly 10 digits (got "${ci.exporter.iecNumber}").`,
          'commercial_invoice.exporter.iecNumber')];
      }
      return [];
    },
  },
  {
    id: 'in_hs_code_8_digit',
    severity: 'warning',
    requires: ['commercial_invoice'],
    packId: 'in',
    check: (m) => {
      const ci = invoice(m.get('commercial_invoice'));
      if (!ci) return [];
      const out: Finding[] = [];
      ci.lines.forEach((l, i) => {
        const digits = l.hsCode.replace(/\D/g, '');
        if (digits.length < 8) {
          out.push(finding('in_hs_code_8_digit', 'warning', ['commercial_invoice'],
            `Line ${i + 1} HS code should be 8 digits for Indian shipping-bill filing (got "${l.hsCode}").`,
            `commercial_invoice.lines[${i}].hsCode`));
        }
      });
      return out;
    },
  },
  {
    id: 'in_gstin_format',
    severity: 'warning',
    requires: ['commercial_invoice'],
    packId: 'in',
    check: (m) => {
      const ci = m.get('commercial_invoice');
      if (!ci) return [];
      // 15-char GSTIN: 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum.
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(ci.exporter.gstin)) {
        return [finding('in_gstin_format', 'warning', ['commercial_invoice'],
          `GSTIN "${ci.exporter.gstin}" is not in the expected 15-character format.`,
          'commercial_invoice.exporter.gstin')];
      }
      return [];
    },
  },
];

function finding(ruleId: string, severity: Severity, docTypes: DocType[], message: string, field?: string): Finding {
  return { ruleId, severity, docTypes, message, field };
}

/** Run every applicable rule over a set of DocModels. `packId` selects pack-specific rules. */
export function runRules(models: DocModel[], packId = 'in'): Finding[] {
  const byType = new Map<DocType, DocModel>();
  for (const m of models) byType.set(m.type, m);

  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (rule.packId && rule.packId !== packId) continue;
    if (!rule.requires.every((t) => byType.has(t))) continue;
    findings.push(...rule.check(byType));
  }
  // Stable order: errors before warnings, then by ruleId — so golden fixtures compare deterministically.
  return findings.sort((a, b) =>
    a.severity === b.severity ? a.ruleId.localeCompare(b.ruleId) : a.severity === 'error' ? -1 : 1,
  );
}
