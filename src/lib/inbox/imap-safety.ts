// SSRF guard for the IMAP connector (M12). Pure apart from the injectable DNS lookup.
//
// Unlike Gmail (a fixed Google endpoint), IMAP dials a host the TENANT typed in. Left unchecked that is a
// server-side request primitive: point "IMAP host" at 169.254.169.254 or an internal service and the worker
// connects to it from inside our network. So a host is only accepted if it is a public DNS name, TLS-only on
// port 993, and EVERY address it resolves to is public. The connector then dials the address we validated
// (not the name), closing the DNS-rebinding window between check and connect.

import { lookup as dnsLookup } from 'node:dns/promises';

export const IMAP_PORT = 993;

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.localdomain', '.lan', '.home.arpa', '.corp', '.intranet'];

/** Syntax-level check on the typed hostname. Returns an error message, or null when acceptable. */
export function validateImapHost(rawHost: string): string | null {
  const host = rawHost.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return 'IMAP host is required.';
  if (host.length > 253) return 'IMAP host is too long.';
  // IP literals are refused outright: a mail provider is always a name, and this removes the whole class
  // of "http://0x7f.1" / decimal / IPv6-bracket encodings.
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return 'Use the provider’s host name (e.g. imap.example.com), not an IP address.';
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return 'That host name points to a private network.';
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return 'That is not a valid host name.';
  return null;
}

export function validateImapPort(port: number): string | null {
  return port === IMAP_PORT ? null : `Only IMAP over TLS on port ${IMAP_PORT} is supported.`;
}

function ipv4ToParts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

/** True for any address that must never be dialled from the server: private, loopback, link-local, CGNAT, metadata, multicast, reserved. */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.trim().toLowerCase();

  const v4 = ipv4ToParts(addr);
  if (v4) {
    const [a, b, c] = v4;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||        // CGNAT
      (a === 169 && b === 254) ||                  // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||     // benchmarking
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || // documentation
      a >= 224                                     // multicast + reserved + broadcast
    );
  }

  if (addr.includes(':')) {
    // IPv4-mapped / -compatible (::ffff:a.b.c.d) → judge the embedded IPv4.
    const mapped = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (addr === '::' || addr === '::1') return true;
    const first = parseInt(addr.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true;  // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true;  // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true;  // multicast
    if (addr.startsWith('64:ff9b:')) return true;  // NAT64 — can wrap private v4
    if (addr.startsWith('2001:db8:')) return true; // documentation
    return false;
  }

  return true; // not a recognisable IP at all → refuse
}

type Lookup = (host: string, opts: { all: true }) => Promise<{ address: string; family: number }[]>;

/**
 * Resolves `host` and returns one address to dial, throwing unless EVERY resolved address is public. Checking
 * all of them matters: a name that returns one public and one private record would otherwise be a coin flip.
 */
export async function resolvePublicAddress(host: string, lookup: Lookup = dnsLookup as unknown as Lookup): Promise<string> {
  const problem = validateImapHost(host);
  if (problem) throw new Error(problem);
  let records: { address: string; family: number }[];
  try {
    records = await lookup(host.trim().toLowerCase().replace(/\.$/, ''), { all: true });
  } catch {
    throw new Error(`Could not resolve ${host}.`);
  }
  if (records.length === 0) throw new Error(`Could not resolve ${host}.`);
  if (records.some((r) => isPrivateAddress(r.address))) throw new Error('That host resolves to a private network address and cannot be used.');
  // Prefer IPv4 for connection stability; any record is already proven public.
  return (records.find((r) => r.family === 4) ?? records[0]).address;
}
