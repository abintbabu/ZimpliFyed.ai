'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearDemoData } from '@/actions/onboarding';

export function DemoDataBanner() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-indigo-900">
        You&apos;re viewing <span className="font-semibold">sample data</span> so you can explore. Clear it whenever you&apos;re ready for the real thing.
      </p>
      <button
        disabled={pending}
        onClick={() => start(async () => { await clearDemoData(); router.refresh(); })}
        className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      >
        {pending ? 'Clearing…' : 'Clear demo data'}
      </button>
    </div>
  );
}
