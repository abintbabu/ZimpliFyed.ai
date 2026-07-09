export const RESERVED_SLUGS = [
  'app', 'admin', 'www', 'api', 'track', 'signup', 'login', 'dashboard',
  'vendor-portal', 'docs', 'status', 'help', 'welcome', 'join', 'no-access',
  'settings', 'billing', 'onboarding',
] as const;

/** Lowercase, hyphenate, strip to the `^[a-z0-9-]{3,40}$` slug charset. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const SLUG_RE = /^[a-z0-9-]{3,40}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !(RESERVED_SLUGS as readonly string[]).includes(slug);
}

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com',
  'hotmail.com', 'live.com', 'proton.me', 'protonmail.com', 'icloud.com',
  'rediffmail.com', 'aol.com', 'zoho.com', 'mail.com',
]);

export function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

export function isFreeMailDomain(domain: string | null): boolean {
  return !!domain && FREE_MAIL_DOMAINS.has(domain);
}
