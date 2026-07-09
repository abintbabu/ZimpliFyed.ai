'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadStage } from '@/actions/leads';
import { convertLeadToBuyer } from '@/actions/buyers';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from './lead-stages';
import type { Lead } from '@prisma/client';

export function LeadCard({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="rounded-xl border border-line bg-white p-3 space-y-2">
      <p className="text-sm font-semibold text-ink">{lead.name}</p>
      {lead.company && <p className="text-xs text-muted">{lead.company}</p>}
      {lead.itemsInterested && <p className="text-xs text-ink-soft">{lead.itemsInterested}</p>}
      {canWrite && (
        <select
          value={lead.stage}
          disabled={pending}
          onChange={(e) => startTransition(() => updateLeadStage(lead.id, e.target.value as Lead['stage']))}
          className="w-full rounded-md border border-line px-2 py-1 text-xs text-ink disabled:opacity-50"
        >
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
          ))}
        </select>
      )}
      {canWrite && (
        lead.convertedBuyerId ? (
          <a href={`/dashboard/buyers/${lead.convertedBuyerId}`} className="block text-xs text-brand hover:underline">
            View buyer →
          </a>
        ) : (
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const buyerId = await convertLeadToBuyer(lead.id);
                router.push(`/dashboard/buyers/${buyerId}`);
              })
            }
            className="text-xs text-brand hover:underline disabled:opacity-50"
          >
            Convert to buyer
          </button>
        )
      )}
    </div>
  );
}
