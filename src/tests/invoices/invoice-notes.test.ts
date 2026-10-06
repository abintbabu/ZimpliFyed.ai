import assert from 'node:assert/strict';
import { effectiveNoteKind, isLegacyUntypedNote, signedInvoiceTotal, validateNote, balanceAfterCredit, derivedInvoiceBalance } from '../../lib/invoice-notes';

/** Credit/debit note rules (pure): `npm run test:invoice-notes`. */

// Kind resolution
assert.equal(effectiveNoteKind({ isCreditOrDebitNote: false }), null);
assert.equal(effectiveNoteKind({ isCreditOrDebitNote: true, noteKind: 'debit' }), 'debit');
assert.equal(effectiveNoteKind({ isCreditOrDebitNote: true, noteKind: null }), 'credit', 'legacy untyped → credit');
assert.equal(isLegacyUntypedNote({ isCreditOrDebitNote: true }), true);
assert.equal(isLegacyUntypedNote({ isCreditOrDebitNote: true, noteKind: 'debit' }), false);
assert.equal(isLegacyUntypedNote({ isCreditOrDebitNote: false }), false);

// Signed totals: invoice +, debit +, credit −; sign comes from the kind, never from the stored total's sign
assert.equal(signedInvoiceTotal({ total: 1000, isCreditOrDebitNote: false }), 1000);
assert.equal(signedInvoiceTotal({ total: 200, isCreditOrDebitNote: true, noteKind: 'debit' }), 200, 'a debit note must not reduce turnover');
assert.equal(signedInvoiceTotal({ total: 200, isCreditOrDebitNote: true, noteKind: 'credit' }), -200);
assert.equal(signedInvoiceTotal({ total: -200, isCreditOrDebitNote: true, noteKind: 'credit' }), -200, 'a pre-negated credit is not double-flipped');
assert.equal(signedInvoiceTotal({ total: 300, isCreditOrDebitNote: true }), -300, 'legacy flagged note keeps GST-prep behaviour');

// Validation
const orig = { total: 1000, currency: 'USD', isNote: false };
const ok = { kind: 'credit' as const, reason: 'Damaged goods', noteTotal: 300, noteCurrency: 'USD', original: orig, priorCreditsOnOriginal: 0 };
assert.equal(validateNote(ok), null);
assert.match(validateNote({ ...ok, reason: '  ' })!, /needs a reason/);
assert.match(validateNote({ ...ok, noteTotal: 0 })!, /above 0/);
assert.match(validateNote({ ...ok, original: null })!, /must reference the invoice/);
assert.equal(validateNote({ ...ok, kind: 'debit', original: null }), null, 'a debit note may stand alone');
assert.match(validateNote({ ...ok, original: { ...orig, isNote: true } })!, /another credit\/debit note/);
assert.match(validateNote({ ...ok, noteCurrency: 'EUR' })!, /EUR but the invoice is in USD/);
assert.match(validateNote({ ...ok, noteTotal: 1000.01 })!, /exceeds what can still be credited/);
assert.equal(validateNote({ ...ok, noteTotal: 1000 }), null, 'crediting the full amount is fine');
assert.match(validateNote({ ...ok, noteTotal: 400, priorCreditsOnOriginal: 700 })!, /still be credited on the invoice \(300\)/, 'prior credits count against the cap');
assert.equal(validateNote({ ...ok, kind: 'debit', noteTotal: 5000 }), null, 'debit notes are not capped by the original');

// Balance after credit
assert.equal(balanceAfterCredit(1000, 300), 700);
assert.equal(balanceAfterCredit(200, 300), 0, 'never negative');
assert.equal(balanceAfterCredit(100.1, 0.2), 99.9);

// Derived balance — payments AND credits both reduce what is owed, so neither can undo the other
assert.deepEqual(derivedInvoiceBalance({ total: 1000, realized: 0, credited: 0 }), { balanceDue: 1000, settledAmount: 0, paid: false });
assert.deepEqual(derivedInvoiceBalance({ total: 1000, realized: 400, credited: 0 }), { balanceDue: 600, settledAmount: 400, paid: false });
assert.deepEqual(derivedInvoiceBalance({ total: 1000, realized: 0, credited: 250 }), { balanceDue: 750, settledAmount: 250, paid: false });
assert.deepEqual(derivedInvoiceBalance({ total: 1000, realized: 400, credited: 250 }), { balanceDue: 350, settledAmount: 650, paid: false }, 'recording a payment must not erase the credit');
assert.equal(derivedInvoiceBalance({ total: 1000, realized: 750, credited: 250 }).paid, true);
assert.equal(derivedInvoiceBalance({ total: 1000, realized: 1200, credited: 0 }).balanceDue, 0, 'overpayment never goes negative');
assert.equal(derivedInvoiceBalance({ total: 1000, realized: 999.995, credited: 0 }).paid, true, 'sub-paisa remainder is paid');
assert.equal(derivedInvoiceBalance({ total: 100.1, realized: 0.1, credited: 0.2 }).balanceDue, 99.8);

console.log('✓ invoice-notes: kind resolution, signed totals, validation, balance');
