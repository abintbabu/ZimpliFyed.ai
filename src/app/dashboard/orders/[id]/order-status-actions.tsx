'use client';

import { useTransition } from 'react';
import { updateOrderStatus } from '@/actions/orders';
import type { OrderStatus } from '@prisma/client';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: 'in_production',
  in_production: 'shipped',
  shipped: 'in_transit',
  in_transit: 'delivered',
};

const LABELS: Record<OrderStatus, string> = {
  confirmed: 'Confirmed',
  in_production: 'In production',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function OrderStatusActions({ orderId, status, canWrite }: { orderId: string; status: OrderStatus; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const next = NEXT_STATUS[status];
  if (!canWrite || !next) return null;

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => updateOrderStatus(orderId, next))}
      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
    >
      Mark {LABELS[next].toLowerCase()}
    </button>
  );
}
