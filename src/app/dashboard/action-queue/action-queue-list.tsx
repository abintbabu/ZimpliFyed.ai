'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { approveAction, rejectAction, snoozeAction } from '@/actions/action-queue';
import { Badge, type BadgeTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';

export type ActionItem = {
  id: string;
  kind: string;
  department: string;
  title: string;
  summary: string;
  payload: Record<string, unknown> | null;
  confidence: number | null;
  linkedType: string | null;
  linkedId: string | null;
  createdAt: string;
};

const DEPT_TONE: Record<string, BadgeTone> = {
  SELL: 'brand',
  MONEY: 'success',
  SHIP: 'neutral',
  COMPLY: 'warning',
};

/** The editable draft body for a follow-up-style action, if the payload carries one. */
function draftText(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const body = payload.body;
  return typeof body === 'string' ? body : null;
}

function ActionCard({ item, canApprove }: { item: ActionItem; canApprove: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialDraft = draftText(item.payload);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialDraft ?? '');

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const approve = () => {
    const edited = initialDraft != null && body !== initialDraft;
    const payload = edited ? { ...item.payload, body } : undefined;
    run(() => approveAction(item.id, payload as never));
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={DEPT_TONE[item.department] ?? 'neutral'}>{item.department}</Badge>
            {item.payload?.channel === 'whatsapp' && <Badge tone="success">WhatsApp</Badge>}
            {item.confidence != null && (
              <span className="text-xs text-muted">{Math.round(item.confidence * 100)}% confidence</span>
            )}
          </div>
          <p className="truncate font-medium text-ink">{item.title}</p>
          <p className="mt-1 text-sm text-muted">{item.summary}</p>
        </div>
      </div>

      {initialDraft != null && (
        <div className="mt-3">
          {editing ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-line bg-canvas p-2 text-sm text-ink"
            />
          ) : (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-2 text-sm text-ink">
              {body}
            </pre>
          )}
        </div>
      )}

      {canApprove && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            onClick={approve}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          {initialDraft != null && (
            <button
              disabled={pending}
              onClick={() => setEditing((v) => !v)}
              className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
            >
              {editing ? 'Done editing' : 'Edit'}
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => run(() => snoozeAction(item.id, 3))}
            className="text-xs font-medium text-muted hover:underline disabled:opacity-50"
          >
            Snooze 3d
          </button>
          <button
            disabled={pending}
            onClick={() => run(() => rejectAction(item.id))}
            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function ActionQueueList({ items, canApprove }: { items: ActionItem[]; canApprove: boolean }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Queue is clear"
        description="When the AI drafts a follow-up, flags an expense to review, or spots a renewal, it shows up here for one tap. Nothing needs you right now."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ActionCard key={item.id} item={item} canApprove={canApprove} />
      ))}
    </div>
  );
}
