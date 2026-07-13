'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { draftQuoteFromEnquiry, type EnquiryDraftResult } from '@/actions/enquiry';

/**
 * The onboarding aha (Sprint 5): paste a raw buyer enquiry, get a draft quote in one tap. The AI extracts the
 * buyer + product, creates/dedupes the Buyer and Lead, and seeds a draft quote — the result card links
 * straight into the quote editor to add cost and send.
 */
export function PasteEnquiryBox() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<EnquiryDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () => {
    setError(null);
    setResult(null);
    if (!text.trim()) {
      setError('Paste the buyer enquiry first');
      return;
    }
    startTransition(async () => {
      try {
        const res = await draftQuoteFromEnquiry(text);
        setResult(res);
        setText('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not draft a quote from that');
      }
    });
  };

  return (
    <div className="rounded-2xl border border-line bg-canvas p-4 dark:bg-surface">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
        <Sparkles className="h-4 w-4 text-brand" />
        Paste a buyer enquiry → draft quote
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the buyer's email or WhatsApp message here — e.g. &quot;Hi, we need 5000 pcs cotton bath towels 500GSM, FOB Nhava Sheva, target USD 3.20/pc…&quot;"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={run}
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Reading & drafting…' : 'Draft quote'}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {result && (
        <div className="mt-3 rounded-lg border border-brand/25 bg-brand-soft/40 p-3 text-sm">
          <p className="text-ink">
            Drafted <Link href={`/dashboard/quotes/${result.quoteId}`} className="font-semibold text-brand hover:underline">{result.quoteNumber}</Link>{' '}
            for <Link href={`/dashboard/buyers/${result.buyerId}`} className="font-medium text-brand hover:underline">{result.buyerName}</Link> —{' '}
            {result.quantity.toLocaleString()} × {result.product} at {result.currency} {result.unitPrice.toFixed(2)} ({result.marginPct}% margin).
          </p>
          <p className="mt-1 text-xs text-muted">
            {result.priceAssumed
              ? 'No target price in the enquiry — add your cost and price in the quote to set the real margin.'
              : 'Margin uses the default assumption until you add your cost in the quote.'}
          </p>
        </div>
      )}
    </div>
  );
}
