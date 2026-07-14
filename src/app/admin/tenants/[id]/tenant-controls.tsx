'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setFeatureFlag,
  clearFeatureFlag,
  suspendTenant,
  reactivateTenant,
  reclaimSlug,
  startImpersonation,
} from '@/actions/platform-admin';
import type { FeatureFlagKey } from '@/lib/feature-flags';

type Flag = { key: FeatureFlagKey; label: string; description: string; enabled: boolean; overridden: boolean };

function useActionState() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string } | unknown>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && typeof res === 'object' && 'error' in res) setError((res as { error: string }).error);
      else router.refresh();
    });
  };
  return { pending, error, run };
}

export function FeatureFlagControls({ tenantId, flags }: { tenantId: string; flags: Flag[] }) {
  const { pending, error, run } = useActionState();
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-danger">{error}</p>}
      {flags.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-4 rounded-xl border border-line-soft p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{f.label}</span>
              {f.overridden && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">override</span>}
            </div>
            <p className="text-xs text-muted">{f.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setFeatureFlag(tenantId, f.key, !f.enabled))}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                f.enabled ? 'bg-success-soft text-success' : 'bg-surface-2 text-ink-soft'
              }`}
            >
              {f.enabled ? 'On' : 'Off'}
            </button>
            {f.overridden && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => clearFeatureFlag(tenantId, f.key))}
                className="text-xs text-muted hover:text-ink disabled:opacity-50"
              >
                reset
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LifecycleControls({
  tenantId,
  status,
  slug,
}: {
  tenantId: string;
  status: string;
  slug: string;
}) {
  const { pending, error, run } = useActionState();
  const [reason, setReason] = useState('');
  const [newSlug, setNewSlug] = useState(slug);

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-danger">{error}</p>}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Reason (audited)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. abuse report #123 / customer request"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm dark:bg-surface"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {status === 'suspended' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reactivateTenant(tenantId))}
            className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success disabled:opacity-50"
          >
            Reactivate tenant
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || status === 'deleted'}
            onClick={() => run(() => suspendTenant(tenantId, reason))}
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger disabled:opacity-50"
          >
            Suspend tenant
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => startImpersonation(tenantId, reason).then((r) => {
            if (r && 'ok' in r) window.location.href = `/admin/tenants/${tenantId}/view`;
            return r;
          }))}
          className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink-soft disabled:opacity-50"
        >
          View as tenant (read-only)
        </button>
      </div>

      <div className="border-t border-line-soft pt-4">
        <label className="mb-1 block text-xs font-medium text-muted">Reclaim / change slug</label>
        <div className="flex gap-2">
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm dark:bg-surface"
          />
          <button
            type="button"
            disabled={pending || newSlug === slug}
            onClick={() => run(() => reclaimSlug(tenantId, newSlug))}
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink-soft disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
