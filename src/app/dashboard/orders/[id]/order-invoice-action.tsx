'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoiceFromOrder } from '@/actions/convert';

export function OrderInvoiceAction({ orderId, invoiceId, canWrite }: { orderId: string; invoiceId: string | null; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (invoiceId) {
    return (
      <Link href={`/dashboard/invoices/${invoiceId}`} className="text-sm text-brand hover:underline">
        View invoice →
      </Link>
    );
  }
  if (!canWrite) return null;

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const invoice = await createInvoiceFromOrder(orderId);
          router.push(`/dashboard/invoices/${invoice.id}`);
        })
      }
      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
    >
      Create invoice
    </button>
  );
}
