// WhatsApp customer-service window (V2). Pure. Meta only allows free-form (session) messages within 24 hours of
// the customer's last inbound message; outside it only pre-approved templates may be sent. This is the gate that
// decides which kind of send is legal — the consent check and the action-queue approval still apply on top.

export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SendMode = 'session' | 'template_only';

export function sessionWindow(lastInboundAt: Date | null, now: Date): { open: boolean; closesAt: Date | null; msLeft: number } {
  if (!lastInboundAt) return { open: false, closesAt: null, msLeft: 0 };
  const closesAt = new Date(lastInboundAt.getTime() + SESSION_WINDOW_MS);
  const msLeft = closesAt.getTime() - now.getTime();
  // A last-inbound timestamp in the future (clock skew) is treated as "now", not as extra window.
  const capped = Math.min(msLeft, SESSION_WINDOW_MS);
  return { open: capped > 0, closesAt, msLeft: Math.max(0, capped) };
}

export function sendModeFor(lastInboundAt: Date | null, now: Date): SendMode {
  return sessionWindow(lastInboundAt, now).open ? 'session' : 'template_only';
}
