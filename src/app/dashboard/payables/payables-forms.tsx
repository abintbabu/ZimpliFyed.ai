'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createVendorBill, recordVendorPayment, voidVendorBill } from '@/actions/payables';

export function NewBillForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ vendorId: '', billNumber: '', billDate: today, dueDate: '', currency: 'INR', total: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const f = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">Record a supplier bill</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Vendor" value={v.vendorId} onChange={(e) => setV({ ...v, vendorId: e.target.value })} className={`${f} w-48`}><option value="">Vendor…</option>{vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input aria-label="Bill number" placeholder="Supplier bill no." value={v.billNumber} onChange={(e) => setV({ ...v, billNumber: e.target.value })} className={`${f} w-40`} />
        <input aria-label="Bill date" type="date" value={v.billDate} onChange={(e) => setV({ ...v, billDate: e.target.value })} className={f} />
        <input aria-label="Due date" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} className={f} title="Due date" />
        <input aria-label="Currency" maxLength={3} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} className={`${f} w-20`} />
        <input aria-label="Total" type="number" min={0} step="any" placeholder="Total" value={v.total} onChange={(e) => setV({ ...v, total: e.target.value })} className={`${f} w-32`} />
        <button disabled={pending || !v.vendorId || !v.billNumber.trim() || !v.total} onClick={() => { setError(null); startTransition(async () => { try { await createVendorBill({ vendorId: v.vendorId, billNumber: v.billNumber, billDate: v.billDate, dueDate: v.dueDate || undefined, currency: v.currency, total: Number(v.total) }); setV({ ...v, billNumber: '', total: '', dueDate: '' }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } }); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add bill</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function PayBillForm({ billId, balance, canVoid }: { billId: string; balance: number; canVoid: boolean }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(String(balance));
  const [mode, setMode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => { setError(null); startTransition(async () => { try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } }); };
  const f = 'rounded border border-line px-1.5 py-1 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input aria-label="Payment amount" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${f} w-24`} />
      <input aria-label="Payment mode" placeholder="NEFT / UPI…" value={mode} onChange={(e) => setMode(e.target.value)} className={`${f} w-24`} />
      <button disabled={pending || !amount} onClick={() => run(() => recordVendorPayment(billId, { amount: Number(amount), paidAt: today, mode }))} className="rounded bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Pay</button>
      {canVoid && <button disabled={pending} onClick={() => { if (window.confirm('Void this bill?')) run(() => voidVendorBill(billId)); }} className="text-xs text-muted underline hover:text-ink">Void</button>}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
