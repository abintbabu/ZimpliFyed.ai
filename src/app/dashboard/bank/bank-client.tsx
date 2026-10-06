'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importBankStatement, confirmBankMatch, ignoreBankLine } from '@/actions/bank';

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [currency, setCurrency] = useState('INR');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    file.text().then((text) => startTransition(async () => {
      try {
        const r = await importBankStatement(text, currency);
        setMsg({ ok: true, text: `${r.imported} new line(s), ${r.duplicates} already imported, ${r.suggested} matched to a document.`, errors: r.errors.map((x) => `Row ${x.row}: ${x.message}`) });
        router.refresh();
      } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Import failed' }); }
      if (fileRef.current) fileRef.current.value = '';
    }));
  }

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">Import a bank statement</p>
      <p className="text-xs text-muted">Upload the CSV your bank lets you download (date, narration, debit/credit or amount). Matches are only <em>suggested</em> — nothing is marked paid until you confirm it.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted">Account currency <input aria-label="Account currency" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="ml-1 w-16 rounded-lg border border-line px-2 py-1.5 text-sm text-ink" /></label>
        <input ref={fileRef} aria-label="Statement CSV" type="file" accept=".csv,text/csv" disabled={pending} onChange={onFile} className="text-sm" />
        {pending && <span className="text-xs text-muted">Importing…</span>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      {msg?.errors && msg.errors.length > 0 && <ul className="text-xs text-amber-800">{msg.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}{msg.errors.length > 5 && <li>…and {msg.errors.length - 5} more rows skipped</li>}</ul>}
    </div>
  );
}

export function LineActions({ id, status, needsForeignAmount, docCurrency }: { id: string; status: string; needsForeignAmount: boolean; docCurrency: string | null }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (status !== 'suggested' && status !== 'unmatched') return null;
  const run = (fn: () => Promise<unknown>) => { setError(null); startTransition(async () => { try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } }); };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === 'suggested' && needsForeignAmount && <input aria-label={`Amount in ${docCurrency}`} type="number" min={0} step="any" placeholder={`${docCurrency} amount`} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded border border-line px-1.5 py-1 text-xs" />}
      {status === 'suggested' && <button disabled={pending || (needsForeignAmount && !amount)} onClick={() => run(() => confirmBankMatch(id, { amountInDocumentCurrency: amount ? Number(amount) : undefined }))} className="rounded bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Confirm</button>}
      <button disabled={pending} onClick={() => run(() => ignoreBankLine(id))} className="text-xs text-muted underline hover:text-ink">Ignore</button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
