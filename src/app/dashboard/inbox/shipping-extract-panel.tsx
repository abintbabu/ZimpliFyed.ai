'use client';

import { useState, useTransition } from 'react';
import { proposeShipmentFromMessage, applyShipmentProposal, type ShipmentProposal } from '@/actions/shipment-extract';

const LABELS: Record<keyof ShipmentProposal['fields'], string> = { blNumber: 'B/L or AWB no.', bookingNumber: 'Booking no.', vesselOrFlight: 'Vessel / flight', forwarderName: 'Forwarder', originPort: 'Origin port', destPort: 'Destination port', etd: 'ETD', eta: 'ETA' };

/** Reads a forwarder's message into a shipment — proposes, shows exactly what would change, applies only what is ticked. */
export function ShippingExtractPanel({ messageId, shipments }: { messageId: string; shipments: { id: string; shipmentNumber: string }[] }) {
  const [shipmentId, setShipmentId] = useState('');
  const [proposal, setProposal] = useState<ShipmentProposal | null>(null);
  const [pickedFields, setPickedFields] = useState<Set<string>>(new Set());
  const [pickedContainers, setPickedContainers] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (shipments.length === 0) return null;

  const read = () => {
    setMsg(null); setProposal(null);
    startTransition(async () => {
      try {
        const r = await proposeShipmentFromMessage(messageId, shipmentId);
        if ('unavailable' in r) { setMsg({ ok: false, text: r.unavailable }); return; }
        setProposal(r.proposal);
        setPickedFields(new Set((Object.keys(r.proposal.fields) as (keyof ShipmentProposal['fields'])[]).filter((k) => r.proposal.fields[k])));
        setPickedContainers(new Set(r.proposal.containers.filter((c) => c.valid && !c.duplicate).map((c) => c.containerNumber)));
        if (!Object.values(r.proposal.fields).some(Boolean) && r.proposal.containers.length === 0) setMsg({ ok: true, text: 'Nothing shipment-related was found in this message.' });
      } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not read the message' }); }
    });
  };

  const apply = () => {
    if (!proposal) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const fields = Object.fromEntries([...pickedFields].map((k) => [k, proposal.fields[k as keyof ShipmentProposal['fields']]]));
        const containers = proposal.containers.filter((c) => pickedContainers.has(c.containerNumber));
        const r = await applyShipmentProposal(shipmentId, { fields, containers });
        setMsg({ ok: true, text: `Applied ${r.fields} field(s) and ${r.containers} container(s).` });
        setProposal(null);
      } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not apply' }); }
    });
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setter(n); };

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">Read as a shipping update</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Shipment" value={shipmentId} onChange={(e) => { setShipmentId(e.target.value); setProposal(null); }} className="rounded-lg border border-line px-3 py-2 text-sm text-ink"><option value="">Apply to shipment…</option>{shipments.map((s) => <option key={s.id} value={s.id}>{s.shipmentNumber}</option>)}</select>
        <button disabled={pending || !shipmentId} onClick={read} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-50">{pending && !proposal ? 'Reading…' : 'Read message (AI)'}</button>
      </div>
      {proposal && (
        <div className="space-y-2">
          <ul className="space-y-1 text-sm">
            {(Object.keys(proposal.fields) as (keyof ShipmentProposal['fields'])[]).filter((k) => proposal.fields[k]).map((k) => (
              <li key={k}><label className="flex items-center gap-2"><input type="checkbox" checked={pickedFields.has(k)} onChange={() => toggle(pickedFields, setPickedFields, k)} /><span className="w-32 text-xs text-muted">{LABELS[k]}</span><span className="text-ink">{proposal.fields[k]}</span></label></li>
            ))}
            {proposal.containers.map((c) => (
              <li key={c.containerNumber}>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={!c.valid || c.duplicate} checked={pickedContainers.has(c.containerNumber)} onChange={() => toggle(pickedContainers, setPickedContainers, c.containerNumber)} /><span className="w-32 text-xs text-muted">Container</span><span className="font-mono text-ink">{c.containerNumber}</span>{c.sealNumber && <span className="text-xs text-muted">seal {c.sealNumber}</span>}{c.type && <span className="text-xs text-muted">{c.type}</span>}</label>
                {!c.valid && <p role="alert" className="ml-6 text-xs text-red-700">Not applied — {c.problem}</p>}
                {c.duplicate && <p className="ml-6 text-xs text-muted">Already on this shipment.</p>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Read by AI from the message — check against the original. Only ticked items are saved; everything else on the shipment stays as it is.</p>
          <button disabled={pending || (pickedFields.size === 0 && pickedContainers.size === 0)} onClick={apply} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Applying…' : 'Apply ticked'}</button>
        </div>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
}
