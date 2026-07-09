import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-shimmer rounded-md', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-[var(--shadow-card)] dark:bg-surface">
      <div className="border-b border-line-soft px-5 py-3">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="divide-y divide-line-soft">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-36' : 'flex-1 max-w-24')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-5 shadow-[var(--shadow-card)] dark:bg-surface">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

export function PageSkeleton({ statCards = 4 }: { statCards?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      {statCards > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: statCards }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}
      <TableSkeleton />
    </div>
  );
}
