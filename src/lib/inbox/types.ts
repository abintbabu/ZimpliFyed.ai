import type { InboxChannelKind } from '@prisma/client';

/**
 * Inbox provider contract — types and the shared error, with no provider imports of their own.
 *
 * This lives apart from `provider.ts` deliberately: the registry in provider.ts imports every concrete
 * connector, and each connector needs the contract. Declaring the contract in provider.ts made that a
 * cycle (provider → gmail → provider), and under CommonJS the winner depended on which module the process
 * happened to load first — importing gmail.ts before provider.ts threw "Cannot access 'gmailProvider'
 * before initialization" at import time. Connectors import from here; only the registry imports connectors.
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
