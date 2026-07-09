import 'server-only';
import { prisma } from '@/lib/prisma';
import { anthropic } from './anthropic';

export type CopilotMessage = { role: 'user' | 'assistant'; content: string };

const COPILOT_MODEL = 'claude-opus-4-8';

async function buildContext(tenantId: string): Promise<string> {
  const [leads, quotes, orders, invoices] = await Promise.all([
    prisma.lead.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.quote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.order.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  const overdueInvoices = invoices.filter(
    (i) => i.status !== 'paid' && i.dueDate != null && i.dueDate < new Date(),
  );

  const lines: string[] = [];

  lines.push(`## Leads (${leads.length} most recent)`);
  for (const l of leads) {
    lines.push(`- ${l.name}${l.company ? ` (${l.company})` : ''} — stage: ${l.stage}, quality: ${l.quality}${l.nextFollowUpAt ? `, next follow-up: ${l.nextFollowUpAt.toISOString().slice(0, 10)}` : ''}`);
  }

  lines.push(`\n## Quotes (${quotes.length} most recent)`);
  for (const q of quotes) {
    lines.push(`- ${q.quoteNumber}: ${q.status}, total ${q.currency} ${q.total}${q.overallMarginPct != null ? `, margin ${q.overallMarginPct}%` : ''}`);
  }

  lines.push(`\n## Orders (${orders.length} most recent)`);
  for (const o of orders) {
    lines.push(`- ${o.orderNumber}: ${o.status}${o.product ? `, ${o.product}` : ''}${o.destination ? ` -> ${o.destination}` : ''}`);
  }

  lines.push(`\n## Invoices (${invoices.length} most recent, ${overdueInvoices.length} overdue)`);
  for (const i of invoices) {
    const overdue = overdueInvoices.includes(i) ? ' [OVERDUE]' : '';
    lines.push(`- ${i.invoiceNumber}: ${i.status}, balance due ${i.currency} ${i.balanceDue}${overdue}`);
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are Zimplifyed Copilot, an assistant for an export trading company's CRM/ops platform. Answer questions using only the tenant data provided in the context below — do not invent orders, quotes, or figures that aren't there. If the data needed to answer isn't in the context, say so plainly rather than guessing. Keep answers concise and business-focused (this is a busy trader, not a chat companion).`;

export type CopilotResult = {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export async function askCopilot(tenantId: string, history: CopilotMessage[]): Promise<CopilotResult> {
  const context = await buildContext(tenantId);

  const response = await anthropic.messages.create({
    model: COPILOT_MODEL,
    max_tokens: 1024,
    system: `${SYSTEM_PROMPT}\n\n# Current tenant data\n${context}`,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    text: textBlock?.type === 'text' ? textBlock.text : '',
    model: response.model,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
  };
}
