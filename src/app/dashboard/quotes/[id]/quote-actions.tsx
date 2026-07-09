'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateQuoteStatus, reviseQuote } from '@/actions/quotes';
import { createOrderFromQuote } from '@/actions/orders';
import type { QuoteStatus } from '@prisma/client';

export function QuoteActions({ quoteId, status, canWrite }: { quoteId: string; status: QuoteStatus; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canWrite) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const revision = await reviseQuote(quoteId);
            router.push(`/dashboard/quotes/${revision.id}`);
          })
        }
        className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50"
      >
        Revise
      </button>
      {status === 'draft' && (
        <button
          disabled={pending}
          onClick={() => startTransition(() => updateQuoteStatus(quoteId, 'sent'))}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50"
        >
          Mark sent
        </button>
      )}
      {(status === 'draft' || status === 'sent') && (
        <button
          disabled={pending}
          onClick={() => startTransition(() => updateQuoteStatus(quoteId, 'accepted'))}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Mark accepted
        </button>
      )}
      {status === 'accepted' && (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const order = await createOrderFromQuote(quoteId, { orderNumber: `ORD-${quoteId.slice(-6).toUpperCase()}` });
              router.push(`/dashboard/orders/${order.id}`);
            })
          }
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Create order
        </button>
      )}
    </div>
  );
}
