'use client';

import { useState, useTransition } from 'react';
import { submitAiFeedback } from '@/actions/ai';
import type { AiFeedbackRating } from '@prisma/client';

const LABELS: Record<AiFeedbackRating, string> = {
  accepted: 'Used as-is',
  edited: 'Used, edited',
  rejected: 'Discarded',
};

/**
 * Shared feedback affordance for every AI-drafted artifact (AI_PLATFORM_SPEC §2): use as-is, edit-then-use, or
 * discard. Drop this next to any output produced via `runAi`. When the surface lets the user edit the draft before
 * acting on it, pass `getEditedOutput` — it's read at "Use" time and, if different from the original, recorded as
 * `edited` with the final value as the training signal; otherwise it's recorded as `accepted`.
 */
export function AiDraftActions({
  interactionId,
  original,
  getCurrentValue,
  onDiscard,
  className = '',
}: {
  interactionId: string;
  /** The AI's original output, for diffing against getCurrentValue() at "Use" time. */
  original?: unknown;
  /** Returns the current (possibly user-edited) value at the moment "Use" is clicked. Omit if the surface has no inline editing. */
  getCurrentValue?: () => unknown;
  onDiscard?: () => void;
  className?: string;
}) {
  const [rating, setRating] = useState<AiFeedbackRating | null>(null);
  const [pending, startTransition] = useTransition();

  function record(next: AiFeedbackRating, editedOutput?: unknown) {
    setRating(next);
    startTransition(() => {
      submitAiFeedback(interactionId, next, undefined, editedOutput).catch(() => setRating(null));
    });
  }

  function handleUse() {
    const current = getCurrentValue?.();
    const changed = current !== undefined && JSON.stringify(current) !== JSON.stringify(original);
    record(changed ? 'edited' : 'accepted', changed ? current : undefined);
  }

  function handleDiscard() {
    onDiscard?.();
    record('rejected');
  }

  if (rating) {
    return <span className={`text-xs text-muted ${className}`}>{LABELS[rating]}</span>;
  }

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <button type="button" onClick={handleUse} disabled={pending} className="text-brand hover:underline disabled:opacity-50">
        Use as-is
      </button>
      <span className="text-line">·</span>
      <button type="button" onClick={handleDiscard} disabled={pending} className="text-muted hover:text-danger disabled:opacity-50">
        Discard
      </button>
    </div>
  );
}
