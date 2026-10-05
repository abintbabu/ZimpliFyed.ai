'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/dashboard/card';
import { Badge, statusTone } from '@/components/dashboard/badge';
import {
  updateShipment,
  setShipmentStatus,
  addContainer,
  removeContainer,
  addFreightQuote,
  setFreightQuoteStatus,
} from '@/actions/shipments';
import type { FreightQuoteStatus, ShipmentMode, ShipmentStatus } from '@prisma/client';

const MODES: ShipmentMode[] = ['sea_fcl', 'sea_lcl', 'air', 'road', 'courier'];
const NEXT_STATUS: Partial<Record<ShipmentStatus, { to: ShipmentStatus; label: string }>> = {
  planning: { to: 'booked', label: 'Mark booked' },
  booked: { to: 'in_transit', label: 'Mark in transit' },
  in_transit: { to: 'arrived', label: 'Mark arrived' },
  arrived: { to: 'delivered', label: 'Mark delivered' },
};

const inputCls = 'w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink dark:bg-surface';
const btnCls = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50';
const ghostBtnCls = 'rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-surface disabled:opacity-50';
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const date = (v: string) => (v ? new Date(v) : null);

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  return { pending, error, run };
}

export function ShipmentStatusActions({ shipmentId, status, canWrite }: { shipmentId: string; status: ShipmentStatus; canWrite: boolean }) {
  const { pending, error, run } = useAction();
  if (!canWrite) return null;
  const next = NEXT_STATUS[status];
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      {next && (
        <button disabled={pending} className={btnCls} onClick={() => run(() => setShipmentStatus(shipmentId, next.to))}>
          {next.label}
        </button>
      )}
      {status !== 'cancelled' && status !== 'delivered' && (
        <button disabled={pending} className={ghostBtnCls} onClick={() => run(() => setShipmentStatus(shipmentId, 'cancelled'))}>
          Cancel
        </button>
      )}
    </div>
  );
}

type Details = {
  id: string; mode: ShipmentMode; forwarderName: string; carrier: string; vesselOrFlight: string; bookingNumber: string;
  originPort: string; destPort: string; etd: string; eta: string; blNumber: string; blDate: string;
  shippingBillNumber: string; shippingBillDate: string; shippingBillPort: string; notes: string;
};

export function ShipmentDetailsForm({ shipment, canWrite }: { shipment: Details; canWrite: boolean }) {
  const [f, setF] = useState(shipment);
  const { pending, error, run } = useAction();
  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const field = (label: string, k: keyof Details, type = 'text') => (
    <label className="block text-xs text-muted">
      {label}
      <input type={type} value={f[k]} onChange={set(k)} disabled={!canWrite} className={inputCls} />
    </label>
  );

  return (
    <Card>
      <CardHeader title="Booking & shipping documents" description="Shipping bill and BL details are recorded here; file uploads stay on the order." />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-muted">
          Mode
          <select value={f.mode} onChange={set('mode')} disabled={!canWrite} className={inputCls}>
            {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>)}
          </select>
        </label>
        {field('Forwarder', 'forwarderName')}
        {field('Carrier / line', 'carrier')}
        {field('Vessel / flight', 'vesselOrFlight')}
        {field('Booking number', 'bookingNumber')}
        {field('Origin port', 'originPort')}
        {field('Destination port', 'destPort')}
        {field('ETD', 'etd', 'date')}
        {field('ETA', 'eta', 'date')}
        {field('BL / AWB number', 'blNumber')}
        {field('BL date', 'blDate', 'date')}
        {field('Shipping bill number', 'shippingBillNumber')}
        {field('Shipping bill date', 'shippingBillDate', 'date')}
        {field('Shipping bill port code', 'shippingBillPort')}
      </div>
      <label className="mt-3 block text-xs text-muted">
        Notes
        <textarea value={f.notes} onChange={set('notes')} disabled={!canWrite} rows={2} className={inputCls} />
      </label>
      {canWrite && (
        <div className="mt-3 flex items-center gap-3">
          <button
            disabled={pending}
            className={btnCls}
            onClick={() =>
              run(() =>
                updateShipment(f.id, {
                  mode: f.mode, forwarderName: f.forwarderName, carrier: f.carrier, vesselOrFlight: f.vesselOrFlight,
                  bookingNumber: f.bookingNumber, originPort: f.originPort, destPort: f.destPort,
                  etd: date(f.etd), eta: date(f.eta), blNumber: f.blNumber, blDate: date(f.blDate),
                  shippingBillNumber: f.shippingBillNumber, shippingBillDate: date(f.shippingBillDate),
                  shippingBillPort: f.shippingBillPort, notes: f.notes,
                }),
              )
            }
          >
            Save
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </Card>
  );
}

type ContainerRow = { id: string; containerNumber: string | null; type: string | null; sealNumber: string | null; grossWeightKg: number | null; cbm: number | null };

export function ContainersPanel({ shipmentId, containers, canWrite }: { shipmentId: string; containers: ContainerRow[]; canWrite: boolean }) {
  const { pending, error, run } = useAction();
  const [f, setF] = useState({ containerNumber: '', type: '40HC', sealNumber: '', grossWeightKg: '', cbm: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader title="Containers" description="FCL: one row per container. LCL: record the cargo volume and weight." />
      {containers.length === 0 ? (
        <p className="text-sm text-muted">No containers recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1">Number</th><th>Type</th><th>Seal</th><th>Gross kg</th><th>CBM</th><th /></tr>
          </thead>
          <tbody>
            {containers.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-1.5">{c.containerNumber ?? '—'}</td>
                <td>{c.type ?? '—'}</td>
                <td>{c.sealNumber ?? '—'}</td>
                <td>{c.grossWeightKg ?? '—'}</td>
                <td>{c.cbm ?? '—'}</td>
                <td className="text-right">
                  {canWrite && <button disabled={pending} className={ghostBtnCls} onClick={() => run(() => removeContainer(shipmentId, c.id))}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite && (
        <div className="mt-4 grid gap-2 sm:grid-cols-6">
          <input placeholder="Container no." value={f.containerNumber} onChange={set('containerNumber')} className={inputCls} />
          <input placeholder="Type" value={f.type} onChange={set('type')} className={inputCls} />
          <input placeholder="Seal" value={f.sealNumber} onChange={set('sealNumber')} className={inputCls} />
          <input placeholder="Gross kg" type="number" value={f.grossWeightKg} onChange={set('grossWeightKg')} className={inputCls} />
          <input placeholder="CBM" type="number" value={f.cbm} onChange={set('cbm')} className={inputCls} />
          <button
            disabled={pending}
            className={btnCls}
            onClick={() =>
              run(async () => {
                await addContainer(shipmentId, { ...f, grossWeightKg: num(f.grossWeightKg), cbm: num(f.cbm) });
                setF((p) => ({ ...p, containerNumber: '', sealNumber: '', grossWeightKg: '', cbm: '' }));
              })
            }
          >
            Add
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

type QuoteRow = { id: string; forwarderName: string; mode: ShipmentMode; currency: string; amount: number | null; transitDays: number | null; validTo: string | null; status: FreightQuoteStatus };

export function FreightQuotesPanel({ shipmentId, quotes, canWrite, defaultMode }: { shipmentId: string; quotes: QuoteRow[]; canWrite: boolean; defaultMode: ShipmentMode }) {
  const { pending, error, run } = useAction();
  const [f, setF] = useState({ forwarderName: '', currency: 'USD', amount: '', transitDays: '', validTo: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const cheapest = quotes.filter((q) => q.amount != null && q.status !== 'rejected' && q.status !== 'expired').reduce<QuoteRow | null>((a, q) => (a && (a.amount ?? Infinity) <= (q.amount ?? Infinity) ? a : q), null);

  return (
    <Card>
      <CardHeader title="Freight quotes" description="Compare forwarders. Accepting a quote rejects the others and sets the forwarder on the shipment." />
      {quotes.length === 0 ? (
        <p className="text-sm text-muted">No quotes yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1">Forwarder</th><th>Mode</th><th>Rate</th><th>Transit</th><th>Valid to</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-line">
                <td className="py-1.5">{q.forwarderName}{cheapest?.id === q.id && quotes.length > 1 && <span className="ml-1 text-xs text-brand">lowest</span>}</td>
                <td>{q.mode.replace('_', ' ').toUpperCase()}</td>
                <td>{q.amount != null ? `${q.currency} ${q.amount.toLocaleString()}` : '—'}</td>
                <td>{q.transitDays != null ? `${q.transitDays}d` : '—'}</td>
                <td>{q.validTo ?? '—'}</td>
                <td><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                <td className="space-x-1 text-right">
                  {canWrite && q.status !== 'accepted' && (
                    <button disabled={pending} className={ghostBtnCls} onClick={() => run(() => setFreightQuoteStatus(shipmentId, q.id, 'accepted'))}>Accept</button>
                  )}
                  {canWrite && q.status !== 'rejected' && q.status !== 'accepted' && (
                    <button disabled={pending} className={ghostBtnCls} onClick={() => run(() => setFreightQuoteStatus(shipmentId, q.id, 'rejected'))}>Reject</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite && (
        <div className="mt-4 grid gap-2 sm:grid-cols-6">
          <input placeholder="Forwarder" value={f.forwarderName} onChange={set('forwarderName')} className={inputCls} />
          <input placeholder="Currency" value={f.currency} onChange={set('currency')} className={inputCls} />
          <input placeholder="Amount" type="number" value={f.amount} onChange={set('amount')} className={inputCls} />
          <input placeholder="Transit days" type="number" value={f.transitDays} onChange={set('transitDays')} className={inputCls} />
          <input type="date" value={f.validTo} onChange={set('validTo')} className={inputCls} />
          <button
            disabled={pending}
            className={btnCls}
            onClick={() =>
              run(async () => {
                await addFreightQuote(shipmentId, {
                  forwarderName: f.forwarderName, mode: defaultMode, currency: f.currency,
                  amount: num(f.amount), transitDays: num(f.transitDays), validTo: date(f.validTo),
                });
                setF((p) => ({ ...p, forwarderName: '', amount: '', transitDays: '', validTo: '' }));
              })
            }
          >
            Add quote
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
