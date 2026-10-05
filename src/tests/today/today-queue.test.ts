import assert from 'node:assert/strict';
import { leadSla } from '../../lib/lead-sla';
import { buildTodayQueue } from '../../lib/today-queue';
import { formatDocNumber, pickFreeDocNumber } from '../../lib/doc-number';

/**
 * Lead SLA, Today-queue ordering and working-document numbering. Pure, no DB: `npm run test:today`.
 */

const NOW = new Date(2026, 9, 5, 10, 0, 0); // 5 Oct 2026, local
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => daysAgo(-n);

// ── leadSla ───────────────────────────────────────────────────────────────────
assert.equal(leadSla({ stage: 'Shipped', nextFollowUpAt: daysAgo(9) }, NOW), null, 'fulfilment stages have no SLA');
assert.equal(leadSla({ stage: 'Lost', updatedAt: daysAgo(30) }, NOW), null, 'lost has no SLA');
assert.deepEqual(leadSla({ stage: 'New', nextFollowUpAt: daysAgo(3) }, NOW)?.level, 'overdue');
assert.equal(leadSla({ stage: 'New', nextFollowUpAt: daysAgo(3) }, NOW)?.days, 3);
assert.equal(leadSla({ stage: 'New', nextFollowUpAt: NOW }, NOW)?.level, 'due', 'today → due');
assert.equal(leadSla({ stage: 'New', nextFollowUpAt: daysAhead(2), updatedAt: daysAgo(30) }, NOW), null, 'future follow-up beats staleness');
assert.equal(leadSla({ stage: 'New', updatedAt: daysAgo(1) }, NOW), null, 'fresh New lead is fine');
assert.equal(leadSla({ stage: 'New', updatedAt: daysAgo(2) }, NOW)?.level, 'stale', 'New goes stale at 2d');
assert.equal(leadSla({ stage: 'Follow_Up', updatedAt: daysAgo(4) }, NOW), null, 'Follow_Up window is 5d');
assert.equal(leadSla({ stage: 'Follow_Up', createdAt: daysAgo(6) }, NOW)?.level, 'stale', 'falls back to createdAt');
assert.equal(leadSla({ stage: 'Quoted_Invoice', updatedAt: daysAgo(40) }, NOW), null, 'quoted stage only flags on a follow-up date');

// ── buildTodayQueue ───────────────────────────────────────────────────────────
const lead = (id: string, over: Partial<Parameters<typeof buildTodayQueue>[0]['leads'] extends (infer L)[] | undefined ? L : never> = {}) => ({
  id, name: id, company: null, stage: 'New' as const, nextFollowUpAt: null, createdAt: daysAgo(10), updatedAt: daysAgo(10), ...over,
});

{
  const items = buildTodayQueue(
    {
      leads: [lead('stale'), lead('overdue', { nextFollowUpAt: daysAgo(4) }), lead('fine', { updatedAt: daysAgo(0) })],
      tasks: [
        { id: 't1', title: 'Call CHA', status: 'open', dueDate: daysAgo(1), linkedLabel: null },
        { id: 't2', title: 'Sign NDA', status: 'open', dueDate: daysAhead(2), linkedLabel: null },
        { id: 't3', title: 'Far away', status: 'open', dueDate: daysAhead(9), linkedLabel: null },
        { id: 't4', title: 'Done already', status: 'done', dueDate: daysAgo(5), linkedLabel: null },
        { id: 't5', title: 'No date', status: 'open', dueDate: null, linkedLabel: null },
      ],
      invoices: [
        { id: 'i1', invoiceNumber: 'INV-1', status: 'sent', dueDate: daysAgo(7), balanceDue: 500, currency: 'USD', isCreditOrDebitNote: false },
        { id: 'i2', invoiceNumber: 'INV-2', status: 'paid', dueDate: daysAgo(7), balanceDue: 0, currency: 'USD', isCreditOrDebitNote: false },
        { id: 'i3', invoiceNumber: 'CN-1', status: 'sent', dueDate: daysAgo(7), balanceDue: 50, currency: 'USD', isCreditOrDebitNote: true },
        { id: 'i4', invoiceNumber: 'INV-4', status: 'sent', dueDate: daysAhead(3), balanceDue: 90, currency: 'USD', isCreditOrDebitNote: false },
      ],
      acceptedQuotesWithoutOrder: [{ id: 'q1', quoteNumber: 'QT-1', updatedAt: daysAgo(2) }],
      shippedOrdersWithoutInvoice: [{ id: 'o1', orderNumber: 'ORD-1', updatedAt: daysAgo(1) }],
      compliance: [
        { id: 'c1', name: 'IEC', expiresAt: daysAgo(3), renewalLeadDays: 30 },
        { id: 'c2', name: 'RCMC', expiresAt: daysAhead(10), renewalLeadDays: 30 },
        { id: 'c3', name: 'Far', expiresAt: daysAhead(200), renewalLeadDays: 30 },
        { id: 'c4', name: 'No expiry', expiresAt: null, renewalLeadDays: 30 },
      ],
      pendingActionCount: 3,
    },
    NOW,
  );

  const ids = items.map((i) => i.id);
  assert.ok(!ids.includes('lead:fine') && !ids.includes('task:t3') && !ids.includes('task:t4') && !ids.includes('task:t5'));
  assert.ok(!ids.includes('invoice:i2') && !ids.includes('invoice:i3') && !ids.includes('invoice:i4'), 'paid / credit notes / not-yet-due invoices excluded');
  assert.ok(!ids.includes('compliance:c3') && !ids.includes('compliance:c4'));
  assert.ok(ids.includes('action:pending') && items.find((i) => i.id === 'action:pending')!.title.startsWith('3 proposals'));

  // Severity first (overdue → due → soon), then longest-overdue first.
  const weights = { overdue: 2, due: 1, soon: 0 } as const;
  for (let i = 1; i < items.length; i++) {
    const [p, c] = [items[i - 1], items[i]];
    assert.ok(weights[p.severity] >= weights[c.severity], `severity order broken at ${p.id} → ${c.id}`);
    if (p.severity === c.severity) assert.ok(p.days >= c.days, `days order broken at ${p.id} → ${c.id}`);
  }
  assert.equal(items[0].id, 'invoice:i1', '7d-overdue invoice outranks 4d-overdue lead');
  assert.equal(items[items.length - 1].severity, 'soon');
  assert.equal(items.find((i) => i.id === 'task:t2')?.severity, 'soon');
}

assert.deepEqual(buildTodayQueue({}, NOW), [], 'empty input → empty queue');

// ── doc numbers ───────────────────────────────────────────────────────────────
assert.equal(formatDocNumber('QT', 7, NOW), 'QT-2026-0007');
assert.equal(formatDocNumber('INV', 12345, NOW), 'INV-2026-12345', 'never truncates past 4 digits');

(async () => {
  const taken = new Set(['ORD-2026-0003', 'ORD-2026-0004']);
  assert.equal(await pickFreeDocNumber('ORD', 3, NOW, async (n) => taken.has(n)), 'ORD-2026-0005', 'walks past collisions');
  await assert.rejects(pickFreeDocNumber('ORD', 1, NOW, async () => true, 3), /Could not allocate/);
  console.log('✓ today-queue: lead SLA, ordering/severity, doc numbering');
})();
