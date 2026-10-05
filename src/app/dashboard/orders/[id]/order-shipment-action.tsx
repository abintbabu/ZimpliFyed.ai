'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createShipment } from '@/actions/shipments';

type Linked = { id: string; shipmentNumber: string };

export function OrderShipmentAction({ orderId, shipments, canWrite }: { orderId: string; shipments: Linked[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      {shipments.map((s) => (
        <Link key={s.id} href={`/dashboard/shipments/${s.id}`} className="text-sm text-brand hover:underline">
          {s.shipmentNumber} →
        </Link>
      ))}
      {canWrite && shipments.length === 0 && (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const shipment = await createShipment({ orderIds: [orderId] });
              router.push(`/dashboard/shipments/${shipment.id}`);
            })
          }
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          Create shipment
        </button>
      )}
    </div>
  );
}
