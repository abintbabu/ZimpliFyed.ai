import 'server-only';
import { headers } from 'next/headers';
import { ROLE_LABELS } from './permissions';
import type { MembershipRole } from '@prisma/client';

/**
 * Teammate-invite email. Until this existed, inviteUser() wrote an Invite row and sent nothing —
 * the invitee had to independently guess to sign in with that address before auth.ts's signIn
 * callback would convert the row into a Membership. An invite nobody is told about is not an invite.
 *
 * Mirrors sendMagicLinkEmail's posture: Resend over plain fetch (no SDK), and a no-op when
 * RESEND_API_KEY is unset so local/dev keeps working. The caller decides whether a send failure is
 * fatal — it shouldn't be, because the Invite row is already committed and the link stays valid.
 */
export type InviteEmailInput = {
  to: string;
  token: string;
  role: MembershipRole;
  tenantName: string;
  invitedByEmail: string;
};

export type InviteEmailResult = { sent: boolean; reason?: string };

/** Absolute /join/<token> URL on the host the invite was created from (the tenant's own subdomain). */
export async function inviteUrl(token: string): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? 'zimplifyed.ai';
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${proto}://${host}/join/${token}`;
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };

  const url = await inviteUrl(input.token);
  const roleLabel = ROLE_LABELS[input.role];
  const subject = `${input.invitedByEmail} invited you to ${input.tenantName} on Zimplifyed`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'Zimplifyed AI <no-reply@zimplifyed.ai>',
        to: input.to,
        subject,
        html: renderHtml({ url, roleLabel, tenantName: input.tenantName, invitedByEmail: input.invitedByEmail }),
        text:
          `${input.invitedByEmail} invited you to join ${input.tenantName} on Zimplifyed as ${roleLabel}.\n\n` +
          `Accept the invite:\n${url}\n\nThis link expires in 14 days.`,
      }),
    });
    if (!res.ok) return { sent: false, reason: `Resend error: ${await res.text()}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'unknown send error' };
  }
}

function renderHtml({
  url,
  roleLabel,
  tenantName,
  invitedByEmail,
}: {
  url: string;
  roleLabel: string;
  tenantName: string;
  invitedByEmail: string;
}) {
  return `
<body style="background:#f4f4f5;padding:32px 0;font-family:-apple-system,Segoe UI,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:32px;text-align:center;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-weight:700;font-size:16px;">S</div>
        <h1 style="font-size:20px;color:#0f172a;margin:20px 0 8px;">Join ${tenantName}</h1>
        <p style="font-size:14px;color:#64748b;margin:0 0 24px;">${invitedByEmail} invited you as <strong style="color:#0f172a;">${roleLabel}</strong>.</p>
        <a href="${url}" style="display:inline-block;padding:12px 28px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;font-weight:600;font-size:14px;">Accept invite</a>
        <p style="font-size:12px;color:#94a3b8;margin:28px 0 0;">This link expires in 14 days. If you weren't expecting it, you can ignore this email.</p>
      </td>
    </tr>
  </table>
</body>`;
}
