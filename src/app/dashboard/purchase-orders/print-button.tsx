'use client';

export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink print:hidden">Print / save as PDF</button>;
}
