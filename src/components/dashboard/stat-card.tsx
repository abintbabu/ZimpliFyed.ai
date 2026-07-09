import type { ElementType, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: ReactNode;
  icon?: ElementType;
  delta?: number;
  deltaLabel?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  href?: string;
}) {
  const Wrapper = href ? 'a' : 'div';
  const toneRing =
    tone === 'success'
      ? 'text-success bg-success-soft'
      : tone === 'warning'
        ? 'text-warning bg-warning-soft'
        : tone === 'danger'
          ? 'text-danger bg-danger-soft'
          : 'text-brand bg-brand-soft';

  return (
    <Wrapper
      href={href}
      className={cn(
        'group flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-5 shadow-[var(--shadow-card)] dark:bg-surface',
        href && 'transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] hover:border-brand/25'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        {Icon && (
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneRing)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none tracking-tight text-ink tabular-nums">
          {value}
        </span>
      </div>
      {typeof delta === 'number' && (
        <div className="flex items-center gap-1 text-xs font-medium">
          <span
            className={cn(
              'flex items-center gap-0.5',
              delta >= 0 ? 'text-success' : 'text-danger'
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(delta)}%
          </span>
          {deltaLabel && <span className="text-muted">{deltaLabel}</span>}
        </div>
      )}
    </Wrapper>
  );
}
