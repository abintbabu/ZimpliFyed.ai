'use client';

import { useState, useTransition } from 'react';
import { startCheckoutAction, startOverageCheckoutAction, openBillingPortalAction } from '@/actions/billing';
import type { TenantPlan } from '@prisma/client';
import type { OveragePack } from '@/lib/billing/provider';

function useAsyncRedirect() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ url: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await action();
        window.location.href = url;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return { pending, error, run };
}

export function UpgradeButton({ plan, label }: { plan: TenantPlan; label: string }) {
  const { pending, error, run } = useAsyncRedirect();
  return (
    <div>
      <button
        onClick={() => run(() => startCheckoutAction(plan))}
        disabled={pending}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Starting checkout…' : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ManageBillingButton() {
  const { pending, error, run } = useAsyncRedirect();
  return (
    <div>
      <button
        onClick={() => run(() => openBillingPortalAction())}
        disabled={pending}
        className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
      >
        {pending ? 'Opening…' : 'Manage billing'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function BuyOverageButton({ pack, label }: { pack: OveragePack; label: string }) {
  const { pending, error, run } = useAsyncRedirect();
  return (
    <div>
      <button
        onClick={() => run(() => startOverageCheckoutAction(pack))}
        disabled={pending}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface disabled:opacity-50"
      >
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
