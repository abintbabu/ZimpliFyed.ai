'use client';

import { useRef, useState, useTransition } from 'react';
import { askCopilotAction } from '@/actions/ai';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Which orders ship this week?',
  'Which invoices are overdue?',
  'What are our leads by stage?',
];

export function CopilotChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    if (!text.trim() || pending) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');

    startTransition(async () => {
      try {
        const reply = await askCopilotAction(next);
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Copilot failed to respond');
      }
    });
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-line bg-white">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block rounded-lg border border-line px-3 py-2 text-left text-sm text-ink hover:bg-surface"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
            m.role === 'user' ? 'ml-auto bg-brand text-white' : 'bg-surface text-ink'
          }`}>
            {m.content}
          </div>
        ))}
        {pending && <div className="max-w-[85%] rounded-2xl bg-surface px-4 py-2 text-sm text-muted">Thinking…</div>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-center gap-2 border-t border-line p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot about your business…"
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
