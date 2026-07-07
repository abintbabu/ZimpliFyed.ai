'use client';

import { useTransition } from 'react';
import { closeVendorRfq } from '@/actions/vendor-rfqs';

export function RfqStatusActions({ rfqId, hasQuotes }: { rfqId: string; hasQuotes: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => closeVendorRfq(rfqId))}
      className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-ink disabled:opacity-50"
    >
      {hasQuotes ? 'Close without awarding' : 'Close RFQ'}
    </button>
  );
}
