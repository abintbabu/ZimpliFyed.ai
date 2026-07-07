import type { ScreeningCheck } from '@prisma/client';

const RESULT_STYLES: Record<string, string> = {
  clear: 'bg-green-100 text-green-700',
  potential_match: 'bg-red-100 text-red-700',
  manual_attestation: 'bg-surface text-muted',
};

const RESULT_LABELS: Record<string, string> = {
  clear: 'Clear',
  potential_match: 'Potential match',
  manual_attestation: 'Manual attestation',
};

export function ScreeningHistory({ checks }: { checks: ScreeningCheck[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Country</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Checked</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} className="border-t border-line">
              <td className="px-4 py-3 text-ink">{c.subjectName}</td>
              <td className="px-4 py-3 text-muted">{c.country ?? '—'}</td>
              <td className="px-4 py-3">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${RESULT_STYLES[c.result]}`}>
                  {RESULT_LABELS[c.result]}
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{c.source}</td>
              <td className="px-4 py-3 text-muted">{new Date(c.checkedAt).toLocaleString()}</td>
            </tr>
          ))}
          {checks.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No screening checks recorded yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
