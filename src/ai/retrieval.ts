import 'server-only';
import { prisma } from '@/lib/prisma';
import { searchKnowledge } from './corpus';
import type { Permission } from '@/lib/permissions';

/**
 * Copilot's tool-use whitelist (AI_PLATFORM_SPEC §4). Isolation is structural, not prompt-promised: each function
 * runs a normal tenant-scoped Prisma query, and the model can only invoke functions the caller's role has the
 * declared `permission` for — e.g. a sales role (no `analytics:read`) never gets `listQuoteMargins` offered as a
 * tool, so it cannot see margin data no matter what it's asked or how the model is prompted.
 */
export type RetrievalTool = {
  name: string;
  description: string;
  permission: Permission;
  /** JSON-schema `properties` for the tool's input, empty for no-arg tools. */
  inputSchema?: Record<string, { type: string; description: string }>;
  run: (tenantId: string, input?: Record<string, unknown>) => Promise<string>;
};

export const RETRIEVAL_TOOLS: RetrievalTool[] = [
  {
    name: 'list_recent_leads',
    description: 'Lists the 20 most recently created leads with stage, quality, and next follow-up date.',
    permission: 'leads:read',
    run: async (tenantId) => {
      const leads = await prisma.lead.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
      if (leads.length === 0) return 'No leads found.';
      return leads
        .map((l) => `- ${l.name}${l.company ? ` (${l.company})` : ''} — stage: ${l.stage}, quality: ${l.quality}${l.nextFollowUpAt ? `, next follow-up: ${l.nextFollowUpAt.toISOString().slice(0, 10)}` : ''}`)
        .join('\n');
    },
  },
  {
    name: 'list_recent_quotes',
    description: 'Lists the 20 most recently created quotes with status and total (no margin figures).',
    permission: 'quotes:read',
    run: async (tenantId) => {
      const quotes = await prisma.quote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
      if (quotes.length === 0) return 'No quotes found.';
      return quotes.map((q) => `- ${q.quoteNumber}: ${q.status}, total ${q.currency} ${q.total}`).join('\n');
    },
  },
  {
    name: 'list_quote_margins',
    description: "Lists the 20 most recently created quotes' margin percentages. Restricted to roles with analytics access.",
    permission: 'analytics:read',
    run: async (tenantId) => {
      const quotes = await prisma.quote.findMany({
        where: { tenantId, overallMarginPct: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      if (quotes.length === 0) return 'No margin data found.';
      return quotes.map((q) => `- ${q.quoteNumber}: margin ${q.overallMarginPct}%`).join('\n');
    },
  },
  {
    name: 'list_recent_orders',
    description: 'Lists the 20 most recently created orders with status, product, and destination.',
    permission: 'orders:read',
    run: async (tenantId) => {
      const orders = await prisma.order.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
      if (orders.length === 0) return 'No orders found.';
      return orders
        .map((o) => `- ${o.orderNumber}: ${o.status}${o.product ? `, ${o.product}` : ''}${o.destination ? ` -> ${o.destination}` : ''}`)
        .join('\n');
    },
  },
  {
    name: 'list_overdue_invoices',
    description: 'Lists invoices that are past due date and not yet paid, with balance due.',
    permission: 'invoices:read',
    run: async (tenantId) => {
      const invoices = await prisma.invoice.findMany({
        where: { tenantId, status: { not: 'paid' }, dueDate: { lt: new Date() } },
        orderBy: { dueDate: 'asc' },
        take: 20,
      });
      if (invoices.length === 0) return 'No overdue invoices.';
      return invoices.map((i) => `- ${i.invoiceNumber}: balance due ${i.currency} ${i.balanceDue}, due ${i.dueDate?.toISOString().slice(0, 10)}`).join('\n');
    },
  },
  {
    name: 'search_trade_knowledge',
    description: 'Searches the trade-knowledge corpus (FTA texts, duty schedules, DGFT circulars, port procedures) for passages relevant to a question. Always cite the returned sourceRef when using this in an answer.',
    permission: 'compliance:read',
    inputSchema: { query: { type: 'string', description: 'The question or topic to search the corpus for.' } },
    run: async (tenantId, input) => {
      const query = typeof input?.query === 'string' ? input.query : '';
      if (!query.trim()) return 'No query provided.';
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { packId: true } });
      if (!process.env.GEMINI_API_KEY) return 'Trade-knowledge search is unavailable (no embedding provider configured).';
      const hits = await searchKnowledge(tenant?.packId ?? 'in', query);
      if (hits.length === 0) return 'No relevant passages found in the trade-knowledge corpus.';
      return hits
        .map((h) => `[source: ${h.sourceRef}] ${h.title}\n${h.text}`)
        .join('\n\n---\n\n');
    },
  },
];

/** Tools visible to a given role — the actual access boundary; the model never even sees a tool it can't call. */
export function toolsForRole(hasPermission: (permission: Permission) => boolean): RetrievalTool[] {
  return RETRIEVAL_TOOLS.filter((t) => hasPermission(t.permission));
}
