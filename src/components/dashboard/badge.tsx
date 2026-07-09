import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-soft',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-soft text-brand',
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  brand: 'bg-brand',
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} />}
      {children}
    </span>
  );
}

/** Maps common lifecycle status strings to a badge tone. Extend as new statuses appear. */
export function statusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (['active', 'accepted', 'paid', 'approved', 'delivered', 'completed', 'won', 'valid', 'ok', 'awarded', 'received', 'clear'].includes(s)) return 'success';
  if (['pending', 'draft', 'in_transit', 'shipped', 'processing', 'expiring_soon', 'partially_paid', 'claimable'].includes(s)) return 'warning';
  if (['rejected', 'expired', 'overdue', 'cancelled', 'failed', 'blocked', 'lost', 'declined', 'potential_match'].includes(s)) return 'danger';
  if (['new', 'quoted', 'in_review', 'sent', 'open', 'claimed'].includes(s)) return 'info';
  if (['void', 'closed', 'no_expiry', 'manual_attestation'].includes(s)) return 'neutral';
  return 'neutral';
}
