'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Plus, RefreshCw, Sparkles, Archive, ArrowUpRight, Mail } from 'lucide-react';
import type { InboxChannelKind, InboxChannelStatus, InboxMessageStatus } from '@prisma/client';
import {
  ingestMessage,
  createChannel,
  classifyNow,
  setMessageStatus,
  triageToLead,
  syncChannel,
  type InboxMessageView,
} from '@/actions/inbox';

type ChannelView = {
  id: string;
  name: string;
  kind: InboxChannelKind;
  identifier: string | null;
  status: InboxChannelStatus;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  buyer_enquiry: 'Buyer enquiry',
  payment: 'Payment',
  logistics: 'Logistics',
  compliance: 'Compliance',
  supplier: 'Supplier',
  spam: 'Spam',
  other: 'Other',
};

const CATEGORY_CLASSES: Record<string, string> = {
  buyer_enquiry: 'bg-brand-soft text-brand',
  payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  logistics: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  compliance: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  supplier: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  spam: 'bg-ink/10 text-muted',
  other: 'bg-ink/10 text-muted',
};

const STATUS_TABS: { key: InboxMessageStatus; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'archived', label: 'Archived' },
];

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) {
    return <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-muted">classifying…</span>;
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_CLASSES[category] ?? CATEGORY_CLASSES.other}`}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

export function InboxWorkbench({
  channels,
  messages,
  canWrite,
}: {
  channels: ChannelView[];
  messages: InboxMessageView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxMessageStatus>('unread');
  const [selectedId, setSelectedId] = useState<string | null>(messages[0]?.id ?? null);
  const [showConnect, setShowConnect] = useState(false);
  const [showCompose, setShowCompose] = useState(channels.length > 0);

  const visible = useMemo(() => messages.filter((m) => m.status === tab), [messages, tab]);
  const selected = messages.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Channels row */}
      <div className="flex flex-wrap items-center gap-2">
        {channels.length === 0 && (
          <p className="text-sm text-muted">No channels yet — connect one to start receiving messages.</p>
        )}
        {channels.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs dark:bg-surface"
            title={c.lastError ?? undefined}
          >
            <Mail className="h-3.5 w-3.5 text-muted" />
            <span className="font-medium text-ink">{c.name}</span>
            <span className="text-muted">· {c.kind}</span>
            {c.status === 'error' && <span className="text-danger">· error</span>}
            {canWrite && (
              <button
                onClick={() => run(() => syncChannel(c.id))}
                disabled={pending}
                title="Sync"
                className="text-muted hover:text-ink disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {canWrite && (
          <button
            onClick={() => setShowConnect((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> Connect channel
          </button>
        )}
      </div>

      {showConnect && canWrite && <ConnectChannelForm pending={pending} onSubmit={(input) => run(() => createChannel(input))} />}

      {canWrite && channels.length > 0 && (
        <>
          <button
            onClick={() => setShowCompose((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            <Plus className="h-4 w-4" /> Add a message
          </button>
          {showCompose && (
            <ComposeForm channels={channels} pending={pending} onSubmit={(input) => run(() => ingestMessage(input))} />
          )}
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        {STATUS_TABS.map((t) => {
          const count = messages.filter((m) => m.status === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-brand text-ink' : 'text-muted hover:text-ink'}`}
            >
              {t.label} <span className="text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Two-pane list + detail */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {visible.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
              <Inbox className="h-6 w-6" />
              Nothing here.
            </div>
          )}
          {visible.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                selected?.id === m.id ? 'border-brand bg-brand-soft/30' : 'border-line bg-canvas hover:border-brand/40 dark:bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {m.fromName || m.fromAddress || 'Unknown sender'}
                </span>
                <CategoryBadge category={m.category} />
              </div>
              <p className="mt-0.5 truncate text-sm text-ink/80">{m.subject || '(no subject)'}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted">{m.summary || m.body}</p>
              <p className="mt-1 text-[11px] text-muted">
                {m.channelName} · {new Date(m.receivedAt).toLocaleString()}
              </p>
            </button>
          ))}
        </div>

        <div>
          {selected ? (
            <MessageDetail
              key={selected.id}
              message={selected}
              canWrite={canWrite}
              pending={pending}
              onTriage={() => run(() => triageToLead(selected.id))}
              onClassify={() => run(() => classifyNow(selected.id))}
              onStatus={(status) => run(() => setMessageStatus(selected.id, status))}
            />
          ) : (
            <div className="rounded-2xl border border-line p-8 text-center text-sm text-muted">
              Select a message to view it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageDetail({
  message,
  canWrite,
  pending,
  onTriage,
  onClassify,
  onStatus,
}: {
  message: InboxMessageView;
  canWrite: boolean;
  pending: boolean;
  onTriage: () => void;
  onClassify: () => void;
  onStatus: (status: InboxMessageStatus) => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-4 dark:bg-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{message.subject || '(no subject)'}</p>
          <p className="text-xs text-muted">
            {message.fromName || 'Unknown'} {message.fromAddress ? `· ${message.fromAddress}` : ''} · {message.channelName}
          </p>
        </div>
        <CategoryBadge category={message.category} />
      </div>

      {message.summary && (
        <p className="mt-3 rounded-lg bg-brand-soft/40 px-3 py-2 text-sm text-ink">
          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-brand" />
          {message.summary}
        </p>
      )}

      <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink/90">
        {message.body}
      </div>

      {message.linkedEntityType === 'lead' && message.linkedEntityId && (
        <p className="mt-3 text-sm">
          <Link href={`/dashboard/leads`} className="font-medium text-brand hover:underline">
            View linked lead <ArrowUpRight className="inline h-3.5 w-3.5" />
          </Link>
        </p>
      )}

      {canWrite && (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.status !== 'triaged' && (
            <button
              onClick={onTriage}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> Triage → lead + quote
            </button>
          )}
          {!message.category && (
            <button
              onClick={onClassify}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
            >
              Classify now
            </button>
          )}
          {message.status !== 'archived' && (
            <button
              onClick={() => onStatus('archived')}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
          )}
          {message.status === 'archived' && (
            <button
              onClick={() => onStatus('unread')}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
            >
              Move to unread
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectChannelForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (input: { kind: InboxChannelKind; name: string; identifier?: string }) => void;
}) {
  const [kind, setKind] = useState<InboxChannelKind>('manual');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');

  return (
    <div className="rounded-2xl border border-line bg-canvas p-4 dark:bg-surface">
      <p className="mb-3 text-sm font-medium text-ink">Connect a channel</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as InboxChannelKind)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="manual">Manual / paste</option>
            <option value="email">Email (forward-in)</option>
            <option value="gmail">Gmail</option>
            <option value="imap">IMAP</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sales inbox"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-muted">
          Address / number
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="sales@acme.com"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>
      {kind !== 'manual' && (
        <p className="mt-2 text-xs text-muted">
          Credentialed live sync for {kind} isn&apos;t connected yet — the channel is created now and starts
          pulling once its connector is enabled. You can still add messages by paste.
        </p>
      )}
      <button
        onClick={() => onSubmit({ kind, name, identifier: identifier || undefined })}
        disabled={pending || !name.trim()}
        className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Add channel'}
      </button>
    </div>
  );
}

function ComposeForm({
  channels,
  pending,
  onSubmit,
}: {
  channels: ChannelView[];
  pending: boolean;
  onSubmit: (input: { channelId: string; fromName?: string; fromAddress?: string; subject?: string; body: string }) => void;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [fromName, setFromName] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const submit = () => {
    onSubmit({
      channelId,
      fromName: fromName || undefined,
      fromAddress: fromAddress || undefined,
      subject: subject || undefined,
      body,
    });
    setBody('');
    setSubject('');
  };

  return (
    <div className="rounded-2xl border border-line bg-canvas p-4 dark:bg-surface">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Channel
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          From (name)
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </label>
        <label className="text-xs text-muted">
          From (email/phone)
          <input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </label>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional)"
        className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Paste the email / WhatsApp message body…"
        className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
      />
      <button
        onClick={submit}
        disabled={pending || !body.trim() || !channelId}
        className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add to inbox'}
      </button>
    </div>
  );
}
