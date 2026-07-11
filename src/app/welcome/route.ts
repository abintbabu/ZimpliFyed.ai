import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { resolvePostAuthDestination } from '@/lib/post-auth';

/**
 * Post-auth resolver hub. Every sign-in lands here; we route onward.
 *
 * A Route Handler (not a page) because it must DELETE the `invite_token`
 * cookie after consuming it — cookie mutation is only allowed in Route
 * Handlers / Server Functions, and doing it in the old Server Component
 * page threw at runtime for every invite-link sign-in.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const linkToken = request.cookies.get('invite_token')?.value ?? null;

  const dest = await resolvePostAuthDestination(
    { id: session.user.id, email: session.user.email },
    linkToken,
  );

  const target =
    dest.kind === 'dashboard'
      ? destUrl(dest.tenantSlug, '/dashboard', request)
      : dest.kind === 'join-choice'
        ? new URL(`/welcome/join?tenant=${dest.tenantSlug}`, request.url)
        : new URL('/welcome/create', request.url);

  const response = NextResponse.redirect(target);
  if (linkToken) response.cookies.delete('invite_token');
  return response;
}

/** In production each tenant lives at {slug}.zimplifyed.ai; in dev everything is the demo host, so link relatively. */
function destUrl(slug: string, path: string, request: NextRequest): URL {
  const base = process.env.NEXT_PUBLIC_APP_DOMAIN; // e.g. "zimplifyed.ai"
  if (base && process.env.NODE_ENV === 'production') return new URL(`https://${slug}.${base}${path}`);
  return new URL(path, request.url);
}
