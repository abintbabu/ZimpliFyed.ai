import 'server-only';
import type { InboxChannelKind } from '@prisma/client';
import { ProviderNotConfiguredError } from './types';
import type { InboxProvider } from './types';
import { gmailProvider } from './gmail';

// The contract lives in ./types (no connector imports) to keep registry→connector→contract acyclic;
// re-exported here so existing `from '@/lib/inbox/provider'` imports keep working.
export * from './types';

/**
 * Inbox provider adapter (Stage 2 — INBOX_SPEC).
 *
 * Every inbound channel resolves to one InboxProvider. The product flow (normalize → classify → triage
 * into a lead/quote) is written against this interface only, so a live connector (Gmail API, IMAP, the
 * WhatsApp Business API) drops in later without touching actions or UI.
 *
 * Today the only fully-implemented provider is `manual`: it pulls nothing on its own — messages arrive by
 * paste (dashboard) or webhook — so the entire triage pipeline is exercisable before any credential exists.
 * The credentialed providers are declared with the same shape and throw a typed "not configured" error
 * until their SDK + IntegrationCredential wiring lands; callers already handle that path.
 */

/** The manual/pasted-in channel: never pulls; messages are created directly via the ingest action. */
const manualProvider: InboxProvider = {
  kind: 'manual',
  canPull: false,
  async fetch() {
    return { messages: [], cursor: null };
  },
};

/** Typed placeholder for a credentialed provider whose live connector isn't wired yet. */
function stubProvider(kind: InboxChannelKind): InboxProvider {
  return {
    kind,
    canPull: true,
    async fetch() {
      throw new ProviderNotConfiguredError(kind);
    },
  };
}

const PROVIDERS: Record<InboxChannelKind, InboxProvider> = {
  manual: manualProvider,
  // Gmail is a live, credentialed connector (fetch-based REST, OAuth refresh-token from the vault).
  gmail: gmailProvider,
  // Remaining credentialed connectors — same interface, wired as each integration lands. `imap` needs a TCP
  // client library; `whatsapp` is webhook-native (Meta Cloud API pushes inbound), so it is fed via its
  // webhook route into ingestMessage rather than pulled here. `email` is the generic forwarding alias.
  email: stubProvider('email'),
  imap: stubProvider('imap'),
  whatsapp: stubProvider('whatsapp'),
};

export function getInboxProvider(kind: InboxChannelKind): InboxProvider {
  return PROVIDERS[kind];
}
