import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { DocContextResult } from '@/lib/doc-engine/context';

export function DocReadinessPanel({ result }: { result: DocContextResult }) {
  if (result.ok) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <p className="text-sm text-ink-soft">
          Ready to generate export documents — all required fields are present.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-warning/30 bg-white">
      <div className="flex items-center gap-3 border-b border-warning/20 bg-warning-soft px-4 py-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-sm font-medium text-ink">
          {result.missing.length} item{result.missing.length > 1 ? 's' : ''} needed before export documents can be generated
        </p>
      </div>
      <ul className="divide-y divide-line-soft">
        {result.missing.map((m) => (
          <li key={m.path} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-ink-soft">{m.label}</span>
            <Link href={m.fixHref} className="text-brand hover:underline">
              Fix
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
