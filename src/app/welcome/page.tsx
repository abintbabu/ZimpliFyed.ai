import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { resolvePostAuthDestination } from '@/lib/post-auth';

export const dynamic = 'force-dynamic';

/** Post-auth resolver hub. Every sign-in lands here; we route onward. */
export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const jar = await cookies();
  const linkToken = jar.get('invite_token')?.value ?? null;

  const dest = await resolvePostAuthDestination(
    { id: session.user.id, email: session.user.email },
    linkToken,
  );

  if (linkToken) jar.delete('invite_token');

  switch (dest.kind) {
    case 'dashboard':
      redirect(destUrl(dest.tenantSlug, '/dashboard'));
    case 'join-choice':
      redirect(`/welcome/join?tenant=${dest.tenantSlug}`);
    case 'create':
      redirect('/welcome/create');
  }
}

/** In production each tenant lives at {slug}.zimplifyed.ai; in dev everything is the demo host, so link relatively. */
function destUrl(slug: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_DOMAIN; // e.g. "zimplifyed.ai"
  if (base && process.env.NODE_ENV === 'production') return `https://${slug}.${base}${path}`;
  return path;
}
