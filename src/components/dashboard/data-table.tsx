import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  className?: string;
  render: (row: T) => ReactNode;
};

/**
 * Shared enterprise table shell: sticky header, hover rows, tabular-nums for
 * numeric columns. Callers stay responsible for fetching/mapping rows.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-canvas shadow-[var(--shadow-card)] dark:bg-surface">
        {empty ?? <div className="px-4 py-12 text-center text-sm text-muted">No records yet.</div>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-canvas shadow-[var(--shadow-card)] dark:bg-surface">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 first:pl-5 last:pr-5',
                  col.align === 'right' || col.numeric ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-t border-line-soft transition-colors hover:bg-surface/70 dark:hover:bg-surface-2/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3 first:pl-5 last:pr-5 text-ink-soft',
                    col.numeric && 'tabular-nums',
                    col.align === 'right' || col.numeric ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.className
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
