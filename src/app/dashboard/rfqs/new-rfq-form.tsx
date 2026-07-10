'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createVendorRfq } from '@/actions/vendor-rfqs';
import { extractRfqSpecFromText } from '@/actions/ai';
import { AiDraftActions } from '@/components/ai-draft-actions';

export function NewRfqForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [extracting, startExtracting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [pastedText, setPastedText] = useState('');
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [description, setDescription] = useState('');
  const [extraction, setExtraction] = useState<{ interactionId: string; original: { title: string; quantity: string; unit: string; targetPrice: string; description: string } } | null>(null);

  function handleExtract() {
    setError(null);
    setExtraction(null);
    startExtracting(async () => {
      try {
        const spec = await extractRfqSpecFromText(pastedText);
        setTitle(spec.product);
        setQuantity(spec.quantity != null ? String(spec.quantity) : '');
        setUnit(spec.unit ?? '');
        setTargetPrice(spec.targetPrice != null ? String(spec.targetPrice) : '');
        const notes = [
          spec.sizes.length ? `Sizes: ${spec.sizes.join(', ')}` : null,
          spec.packing ? `Packing: ${spec.packing}` : null,
          spec.deliveryTerms ? `Delivery: ${spec.deliveryTerms}` : null,
        ].filter(Boolean).join('\n');
        setDescription(notes);
        setExtraction({
          interactionId: spec.interactionId,
          original: {
            title: spec.product,
            quantity: spec.quantity != null ? String(spec.quantity) : '',
            unit: spec.unit ?? '',
            targetPrice: spec.targetPrice != null ? String(spec.targetPrice) : '',
            description: notes,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI extraction failed');
      }
    });
  }

  const submit = (formData: FormData) => {
    setError(null);
    const rfqNumber = String(formData.get('rfqNumber') ?? '').trim();
    const vendorIds = formData.getAll('vendorIds').map(String);
    if (!title.trim() || !rfqNumber) return;
    if (vendorIds.length === 0) {
      setError('Select at least one vendor to invite');
      return;
    }

    startTransition(async () => {
      try {
        const rfq = await createVendorRfq({
          rfqNumber,
          title: title.trim(),
          description,
          quantity: quantity ? Number(quantity) : undefined,
          unit,
          targetPrice: targetPrice ? Number(targetPrice) : undefined,
          vendorIds,
          aiInteractionId: extraction?.interactionId,
        });
        setOpen(false);
        router.push(`/dashboard/rfqs/${rfq.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create RFQ');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        New RFQ
      </button>
    );
  }

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted uppercase tracking-wide">Paste buyer email/spec (optional)</p>
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste the buyer's RFQ email or spec text here…"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
          rows={4}
        />
        <button
          type="button"
          onClick={handleExtract}
          disabled={extracting || !pastedText.trim()}
          className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-50"
        >
          {extracting ? 'Extracting…' : 'Extract with AI'}
        </button>
        {extraction && (
          <div className="mt-2">
            <AiDraftActions
              interactionId={extraction.interactionId}
              original={extraction.original}
              getCurrentValue={() => ({ title, quantity, unit, targetPrice, description })}
              onDiscard={() => { setTitle(''); setQuantity(''); setUnit(''); setTargetPrice(''); setDescription(''); }}
            />
          </div>
        )}
      </div>

      <input name="rfqNumber" required placeholder="RFQ number (e.g. RFQ-001)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="Title (e.g. Cotton Bath Towel 500GSM)"
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
      />
      <input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        type="number"
        placeholder="Quantity"
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
      />
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder="Unit (pcs, kg…)"
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
      />
      <input
        value={targetPrice}
        onChange={(e) => setTargetPrice(e.target.value)}
        type="number"
        step="0.01"
        placeholder="Target price"
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description / spec notes"
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2"
        rows={2}
      />

      <div className="sm:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted uppercase tracking-wide">Invite vendors</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="vendorIds" value={v.id} className="rounded border-line" />
              {v.name}
            </label>
          ))}
          {vendors.length === 0 && <p className="text-sm text-muted">No vendors yet — add one first.</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Sending…' : 'Send RFQ'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
