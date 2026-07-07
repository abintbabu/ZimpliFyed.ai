'use client';

import { useState, useTransition } from 'react';
import { upsertShipmentMilestone } from '@/actions/shipment-milestones';
import { MILESTONE_ORDER, MILESTONE_LABELS } from '@/lib/shipment-milestones';
import type { ShipmentMilestoneType } from '@prisma/client';

type Milestone = { type: ShipmentMilestoneType; plannedAt: Date | null; actualAt: Date | null; notes: string | null };

function toDateInputValue(d: Date | null) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

export function ShipmentTimelinePanel({
  orderId,
  initialMilestones,
  canWrite,
}: {
  orderId: string;
  initialMilestones: Milestone[];
  canWrite: boolean;
}) {
  const [milestones, setMilestones] = useState<Map<ShipmentMilestoneType, Milestone>>(
    new Map(initialMilestones.map((m) => [m.type, m])),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(type: ShipmentMilestoneType, plannedAt: string, actualAt: string) {
    setError(null);
    startTransition(async () => {
      try {
        const saved = await upsertShipmentMilestone({
          orderId,
          type,
          plannedAt: plannedAt ? new Date(plannedAt) : null,
          actualAt: actualAt ? new Date(actualAt) : null,
        });
        setMilestones((prev) => new Map(prev).set(type, saved));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save milestone');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Shipment timeline</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ol className="space-y-3">
        {MILESTONE_ORDER.map((type) => {
          const m = milestones.get(type);
          const reached = !!m?.actualAt;
          return (
            <li key={type} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${reached ? 'bg-green-600' : 'bg-line'}`} />
              <span className="w-40 shrink-0 text-sm text-ink">{MILESTONE_LABELS[type]}</span>
              {canWrite ? (
                <div className="flex flex-1 items-center gap-2 text-xs">
                  <label className="flex items-center gap-1 text-muted">
                    Planned
                    <input
                      type="date"
                      disabled={pending}
                      defaultValue={toDateInputValue(m?.plannedAt ?? null)}
                      onChange={(e) => handleSave(type, e.target.value, toDateInputValue(m?.actualAt ?? null))}
                      className="rounded border border-line px-2 py-1"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-muted">
                    Actual
                    <input
                      type="date"
                      disabled={pending}
                      defaultValue={toDateInputValue(m?.actualAt ?? null)}
                      onChange={(e) => handleSave(type, toDateInputValue(m?.plannedAt ?? null), e.target.value)}
                      className="rounded border border-line px-2 py-1"
                    />
                  </label>
                </div>
              ) : (
                <span className="text-xs text-muted">
                  {m?.actualAt ? `Actual: ${new Date(m.actualAt).toLocaleDateString()}` : m?.plannedAt ? `Planned: ${new Date(m.plannedAt).toLocaleDateString()}` : '—'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
