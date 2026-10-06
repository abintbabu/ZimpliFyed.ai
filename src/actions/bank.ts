'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { parseBankStatement, lineFingerprint, suggestMatch, type MatchCandidate } from '@/lib/bank-reconcile';
import { recordBankRealization } from '@/actions/bank-realizations';
import { recordVendorPayment } from '@/actions/payables';
import { billBalance } from '@/lib/payables';

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 5000;

/**
 * Imports a bank statement CSV and proposes a match for each line. Nothing is settled here: a line only
 * becomes a realisation / payment when a person confirms it. Re-importing the same file is a no-op
 * (fingerprint dedupe), so overlapping statement periods are safe.
 */
export async function importBankStatement(csv: string, accountCurrency = 'INR') {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to import bank statements');
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) throw new Error('That file is over 2 MB — import one month at a time');
  const currency = accountCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Account currency must be a 3-letter code');

  const parsed = parseBankStatement(csv);
  if (parsed.lines.length === 0) return { imported: 0, duplicates: 0, suggested: 0, errors: parsed.errors };
  if (parsed.lines.length > MAX_LINES) throw new Error(`That statement has ${parsed.lines.length} lines — the limit is ${MAX_LINES}`);

  const batch = `imp_${Date.now().toString(36)}`;
  const rows = parsed.lines.map((l) => ({ tenantId, importBatch: batch, fingerprint: lineFingerprint(l), txnDate: l.txnDate, narration: l.narration || '(no narration)', reference: l.reference, amount: l.amount, currency }));
  const created = await prisma.bankStatementLine.createMany({ data: rows, skipDuplicates: true }); // tenant-safe: every row in `rows` carries tenantId (built above)
  const fresh = created.count > 0 ? await prisma.bankStatementLine.findMany({ where: { tenantId, importBatch: batch } }) : [];

  const [invoices, bills] = await Promise.all([
    prisma.invoice.findMany({ where: { tenantId, isDemo: false, isCreditOrDebitNote: false, status: { in: ['sent', 'partially_paid', 'overdue'] }, balanceDue: { gt: 0.01 } }, select: { id: true, invoiceNumber: true, balanceDue: true, currency: true, order: { select: { buyer: { select: { name: true } } } } } }),
    prisma.vendorBill.findMany({ where: { tenantId, status: { in: ['open', 'partially_paid'] } }, include: { payments: { select: { amount: true } }, vendor: { select: { name: true } } } }),
  ]);
  const invCands: MatchCandidate[] = invoices.map((i) => ({ id: i.id, number: i.invoiceNumber, amount: i.balanceDue, currency: i.currency, party: i.order?.buyer?.name ?? null }));
  const billCands: MatchCandidate[] = bills.map((b) => ({ id: b.id, number: b.billNumber, amount: billBalance(b.total, b.payments), currency: b.currency, party: b.vendor.name }));

  let suggested = 0;
  for (const line of fresh) {
    const m = suggestMatch({ narration: line.narration, reference: line.reference, amount: line.amount }, line.amount > 0 ? invCands : billCands, currency);
    if (!m) continue;
    await prisma.bankStatementLine.update({
      where: { id: line.id, tenantId },
      data: { matchStatus: 'suggested', matchedInvoiceId: line.amount > 0 ? m.candidateId : null, matchedBillId: line.amount > 0 ? null : m.candidateId, matchNote: `${m.confidence} confidence — ${m.reasons.join('; ')}` },
    });
    suggested += 1;
  }

  await writeAudit({ session, collection: 'bank_statement', documentId: batch, action: 'upload', summary: `Imported bank statement: ${created.count} new line(s), ${parsed.lines.length - created.count} already present, ${suggested} suggested`, after: { imported: created.count, suggested } });
  revalidatePath('/dashboard/bank');
  return { imported: created.count, duplicates: parsed.lines.length - created.count, suggested, errors: parsed.errors };
}

export async function listBankLines(status?: 'unmatched' | 'suggested' | 'confirmed' | 'ignored') {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:read')) return [];
  const lines = await prisma.bankStatementLine.findMany({ where: { tenantId, ...(status ? { matchStatus: status } : {}) }, orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }], take: 300 });
  const invIds = lines.map((l) => l.matchedInvoiceId).filter((x): x is string => !!x);
  const billIds = lines.map((l) => l.matchedBillId).filter((x): x is string => !!x);
  const [invs, bills] = await Promise.all([
    invIds.length ? prisma.invoice.findMany({ where: { tenantId, id: { in: invIds } }, select: { id: true, invoiceNumber: true, currency: true, balanceDue: true } }) : [],
    billIds.length ? prisma.vendorBill.findMany({ where: { tenantId, id: { in: billIds } }, select: { id: true, billNumber: true, currency: true } }) : [],
  ]);
  return lines.map((l) => {
    const inv = invs.find((i) => i.id === l.matchedInvoiceId);
    const bill = bills.find((b) => b.id === l.matchedBillId);
    return { ...l, target: inv ? { kind: 'invoice' as const, number: inv.invoiceNumber, currency: inv.currency, balance: inv.balanceDue } : bill ? { kind: 'bill' as const, number: bill.billNumber, currency: bill.currency, balance: null } : null };
  });
}

/** Confirms a suggested match: records the realisation (credit) or payment (debit). Cross-currency needs the amount in the document's currency. */
export async function confirmBankMatch(lineId: string, input: { amountInDocumentCurrency?: number } = {}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to confirm bank matches');

  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
  if (!line) throw new Error('Statement line not found');
  if (line.matchStatus !== 'suggested') throw new Error('Only a suggested match can be confirmed');

  if (line.amount > 0 && line.matchedInvoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: line.matchedInvoiceId, tenantId } });
    if (!invoice) throw new Error('The matched invoice no longer exists');
    const sameCurrency = invoice.currency.toUpperCase() === line.currency.toUpperCase();
    const amount = sameCurrency ? line.amount : input.amountInDocumentCurrency;
    if (amount == null || !(amount > 0)) throw new Error(`The bank credited ${line.currency}; enter the amount in ${invoice.currency} that this settles.`);
    if (amount > invoice.balanceDue + 0.01) throw new Error(`That is more than the ${invoice.balanceDue} still outstanding on ${invoice.invoiceNumber}.`);
    await recordBankRealization({ invoiceId: invoice.id, realizedAmount: amount, realizedCurrency: invoice.currency, realizedAt: line.txnDate, bankName: undefined, notes: `Bank statement ${line.txnDate.toISOString().slice(0, 10)}: ${line.narration}${sameCurrency ? '' : ` (credited ${line.currency} ${line.amount})`}` });
  } else if (line.amount < 0 && line.matchedBillId) {
    const bill = await prisma.vendorBill.findFirst({ where: { id: line.matchedBillId, tenantId } });
    if (!bill) throw new Error('The matched bill no longer exists');
    const sameCurrency = bill.currency.toUpperCase() === line.currency.toUpperCase();
    const amount = sameCurrency ? Math.abs(line.amount) : input.amountInDocumentCurrency;
    if (amount == null || !(amount > 0)) throw new Error(`The bank debited ${line.currency}; enter the amount in ${bill.currency} that this settles.`);
    await recordVendorPayment(bill.id, { amount, paidAt: line.txnDate.toISOString().slice(0, 10), mode: 'Bank', reference: line.reference ?? undefined, notes: line.narration });
  } else {
    throw new Error('This line has no matched document');
  }

  await prisma.bankStatementLine.update({ where: { id: lineId, tenantId }, data: { matchStatus: 'confirmed' } });
  await writeAudit({ session, collection: 'bank_statement', documentId: lineId, action: 'update', summary: `Confirmed bank match: ${line.narration.slice(0, 60)}`, after: { matchedInvoiceId: line.matchedInvoiceId, matchedBillId: line.matchedBillId } });
  revalidatePath('/dashboard/bank');
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard/payables');
}

export async function ignoreBankLine(lineId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to change bank lines');
  const res = await prisma.bankStatementLine.updateMany({ where: { id: lineId, tenantId, matchStatus: { in: ['unmatched', 'suggested'] } }, data: { matchStatus: 'ignored', matchedInvoiceId: null, matchedBillId: null } });
  if (res.count === 0) throw new Error('Line not found or already settled');
  revalidatePath('/dashboard/bank');
}
