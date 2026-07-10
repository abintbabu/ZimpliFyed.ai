import 'server-only';
import type { EmailProviderSendVerificationRequestParams } from 'next-auth/providers/email';
import { checkRateLimitDb } from '@/lib/rate-limit-db';

const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;

/**
 * Custom sendVerificationRequest for the next-auth Resend provider.
 * Adds a DB-backed rate limit (magic-link requests hit an external API and
 * leak whether an email exists, so they need the same guard as credentials
 * login) and a branded email in place of Auth.js's default template.
 */
export async function sendMagicLinkEmail(params: EmailProviderSendVerificationRequestParams) {
  const { identifier: to, url, provider } = params;
  const apiKey = (provider as { apiKey?: string }).apiKey;
  if (!apiKey) throw new Error('Resend provider missing apiKey');

  const { allowed } = await checkRateLimitDb(
    `magic-link:${to.trim().toLowerCase()}`,
    REQUEST_LIMIT,
    REQUEST_WINDOW_MS,
  );
  if (!allowed) {
    throw new Error('Too many sign-in requests. Please try again later.');
  }

  const { host } = new URL(url);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: provider.from,
      to,
      subject: `Sign in to ${host}`,
      html: renderHtml({ url, host }),
      text: `Sign in to ${host}\n\n${url}\n\nThis link expires in 24 hours. If you didn't request it, you can ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error sending magic link: ${body}`);
  }
}

function renderHtml({ url, host }: { url: string; host: string }) {
  return `
<body style="background:#f4f4f5;padding:32px 0;font-family:-apple-system,Segoe UI,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:32px;text-align:center;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-weight:700;font-size:16px;">S</div>
        <h1 style="font-size:20px;color:#0f172a;margin:20px 0 8px;">Sign in to ${host}</h1>
        <p style="font-size:14px;color:#64748b;margin:0 0 24px;">Click the button below to sign in. This link expires in 24 hours.</p>
        <a href="${url}" style="display:inline-block;padding:12px 28px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;font-weight:600;font-size:14px;">Sign in</a>
        <p style="font-size:12px;color:#94a3b8;margin:28px 0 0;">If you didn't request this, you can safely ignore this email.</p>
      </td>
    </tr>
  </table>
</body>`;
}
