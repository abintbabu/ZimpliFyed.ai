import 'server-only';
import type { InboxChannelKind } from '@prisma/client';

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

/** A normalized inbound item as a provider hands it back, before it becomes an InboxMessage row. */
export type NormalizedMessage = {
  externalMessageId: string;
  fromName?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  body: string;
  receivedAt: Date;
};

export type FetchArgs = {
  tenantId: string;
  /** The channel's IntegrationCredential discriminator (empty string = tenant default). */
  account: string;
  /** Provider watermark from the last sync (Gmail historyId / IMAP UID / ISO timestamp); null on first run. */
  cursor: string | null;
};

export type FetchResult = {
  messages: NormalizedMessage[];
  /** New watermark to persist on the channel for the next incremental pull. */
  cursor: string | null;
};

export interface InboxProvider {
  readonly kind: InboxChannelKind;
  /** Whether this provider can pull on its own. `manual` returns false — it is fed externally. */
  readonly canPull: boolean;
  /** Incrementally fetch messages newer than `cursor`. Must be idempotent w.r.t. externalMessageId. */
  fetch(args: FetchArgs): Promise<FetchResult>;
}

/** Raised by credentialed providers that have no working connector yet. Callers surface it as a channel error. */
export class ProviderNotConfiguredError extends Error {
  constructor(kind: InboxChannelKind) {
    super(`Inbox provider "${kind}" is not connected yet — add its credential to enable live sync.`);
    this.name = 'ProviderNotConfiguredError';
  }
}

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
  // Credentialed connectors — same interface, wired as each integration lands.
  email: stubProvider('email'),
  gmail: stubProvider('gmail'),
  imap: stubProvider('imap'),
  whatsapp: stubProvider('whatsapp'),
};

export function getInboxProvider(kind: InboxChannelKind): InboxProvider {
  return PROVIDERS[kind];
}
