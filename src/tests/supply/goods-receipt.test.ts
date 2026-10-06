import assert from 'node:assert/strict';
import { validateReceipt, poReceiptProgress } from '../../lib/goods-receipt';

/** Goods-receipt rules (pure): run via `npm run test:supply`. */

const po = [{ id: 'l1', description: 'Yarn', quantity: 100 }, { id: 'l2', description: 'Cartons', quantity: 50 }];
const line = (o: Partial<Parameters<typeof validateReceipt>[0][number]> = {}) => ({ poLineId: 'l1', description: 'Yarn', qtyReceived: 10, qtyRejected: 0, ...o });

assert.equal(validateReceipt([line()], po), null);
assert.match(validateReceipt([], po)!, /at least one/); assert.match(validateReceipt([line({ qtyReceived: 0 })], po)!, /at least one/);
assert.match(validateReceipt([line({ qtyReceived: -1 })], po)!, /negative/);
assert.match(validateReceipt([line({ qtyReceived: 5, qtyRejected: 6, rejectReason: 'x' })], po)!, /cannot exceed/);
assert.match(validateReceipt([line({ qtyRejected: 2 })], po)!, /reason/); assert.equal(validateReceipt([line({ qtyRejected: 2, rejectReason: 'Torn' })], po), null);
assert.match(validateReceipt([line({ poLineId: 'zzz' })], po)!, /not on this purchase order/);
assert.equal(validateReceipt([line({ poLineId: null, description: 'Extra' })], po), null, 'an unplanned extra line is allowed');
assert.equal(validateReceipt([line(), line({ poLineId: 'l2', description: 'Cartons', qtyReceived: 0 })], po), null, 'zero-quantity lines are ignored');

// Progress across partial deliveries
{
  const first = [line({ qtyReceived: 60, qtyRejected: 5, rejectReason: 'wet' })];
  const p1 = poReceiptProgress(po, [first]);
  assert.equal(p1.complete, false); assert.equal(p1.anyReceived, true);
  assert.deepEqual(p1.lines[0], { poLineId: 'l1', description: 'Yarn', ordered: 100, received: 60, rejected: 5, accepted: 55, remaining: 40 });
  assert.equal(p1.lines[1].remaining, 50);
  const p2 = poReceiptProgress(po, [first, [line({ qtyReceived: 40 }), line({ poLineId: 'l2', description: 'Cartons', qtyReceived: 50 })]]);
  assert.equal(p2.complete, true); assert.equal(p2.lines[0].received, 100);
  assert.equal(poReceiptProgress(po, [[line({ qtyReceived: 100 })]]).complete, false, 'every line must be covered');
  assert.equal(poReceiptProgress(po, [[line({ qtyReceived: 130 }), line({ poLineId: 'l2', description: 'C', qtyReceived: 50 })]]).complete, true, 'over-delivery still completes');
  assert.equal(poReceiptProgress(po, [[line({ qtyReceived: 130 })]]).lines[0].remaining, 0, 'remaining never negative');
  assert.equal(poReceiptProgress(po, []).anyReceived, false); assert.equal(poReceiptProgress([], []).complete, false, 'a PO with no lines is never "complete"');
  assert.equal(poReceiptProgress(po, [[line({ poLineId: null, qtyReceived: 999 })]]).lines[0].received, 0, 'unplanned extras do not count toward a PO line');
}
console.log('✓ goods-receipt: validation, partial-delivery progress');
