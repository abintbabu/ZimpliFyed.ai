// Vendor-portal tokens (V2). The vendor opens a link with no login, so the link IS the credential: it is 192
// bits of randomness, shown once, and only its SHA-256 is stored — a database leak does not yield working links.
// Lookups hash the presented token and compare in constant time.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const INVITE_TOKEN_BYTES = 24;
export const DEFAULT_INVITE_TTL_DAYS = 14;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Shape check before touching the database — rejects junk and oversized input cheaply. */
export function looksLikeInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

export function tokenMatches(presented: string, storedHash: string): boolean {
  if (!looksLikeInviteToken(presented) || storedHash.length !== 64) return false;
  const a = Buffer.from(hashInviteToken(presented), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function inviteExpiry(now: Date, days = DEFAULT_INVITE_TTL_DAYS): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export function inviteUsable(input: { tokenExpiresAt: Date | null; now: Date; rfqOpen: boolean }): { ok: boolean; reason?: string } {
  if (!input.rfqOpen) return { ok: false, reason: 'This request for quotation is closed.' };
  if (!input.tokenExpiresAt) return { ok: false, reason: 'This link is not active.' };
  if (input.tokenExpiresAt.getTime() <= input.now.getTime()) return { ok: false, reason: 'This link has expired.' };
  return { ok: true };
}
