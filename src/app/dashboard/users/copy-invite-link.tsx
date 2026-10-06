'use client';

import { useState } from 'react';

/**
 * Manual fallback for when invite email can't be delivered (no RESEND_API_KEY, a bounced address,
 * a mail outage). The invite row and its token are already valid at that point, so the owner just
 * needs the URL — without this, a failed send left the invite unreachable.
 */
export function CopyInviteLink({ token }: { token: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!token) return <span className="text-xs text-muted">—</span>;

  const copy = async () => {
    // Built client-side so the link always carries the host the admin is actually on (the tenant's
    // own subdomain), which is the host /join/<token> must be opened against.
    const url = `${window.location.origin}/join/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded browsers — fall back to
      // showing the URL so it can be selected by hand rather than failing silently.
      window.prompt('Copy this invite link:', url);
    }
  };

  return (
    <button onClick={copy} className="text-xs font-medium text-brand hover:underline">
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
