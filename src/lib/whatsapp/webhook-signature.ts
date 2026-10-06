import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies Meta's `X-Hub-Signature-256` over the RAW webhook body (EXPORT_OS_MASTER_PLAN §10.2 /
 * §17 launch blocker #2).
 *
 * Until this existed, src/app/api/inbox/whatsapp/route.ts trusted whatever POSTed to it and routed
 * the payload to a tenant purely by `metadata.phone_number_id` — so anyone who learned a business
 * number's id could inject messages into that tenant's inbox, and from there into its inbox.ingest
 * AI classification queue. The webhook has no session to authenticate against, so the HMAC *is*
 * the authentication.
 *
 * Three details that matter:
 *  - the HMAC must cover the exact bytes Meta signed, so the caller must pass the unparsed body
 *    text. Re-serialising parsed JSON changes the bytes and the signature can never match.
 *  - the comparison is timing-safe, and lengths are compared first because `timingSafeEqual`
 *    throws rather than returning false on a length mismatch.
 *  - a malformed hex digest must not throw: Buffer.from(hex) silently truncates on bad input, so
 *    the length check is what rejects it.
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined = process.env.WHATSAPP_APP_SECRET,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!secret) {
    // Fail closed in production — an unverified webhook is the vulnerability, not the fallback.
    // Locally, allow unsigned deliveries so the pipeline can be exercised without Meta credentials.
    return nodeEnv !== 'production';
  }
  if (!header?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** The signature header value for a body — used by tests and local webhook replay tooling. */
export function signWhatsAppBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}
