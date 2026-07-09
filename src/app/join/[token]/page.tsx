import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Link-invite entry point. If authed, consume immediately via the resolver;
 * if not, stash the token in a cookie and send to signup — the resolver picks
 * it up (step 0) after sign-in.
 */
export default async function JoinTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { tenant: { select: { name: true } } },
  });

  const invalid =
    !invite ||
    (invite.expiresAt && invite.expiresAt < new Date()) ||
    (invite.maxUses != null && invite.useCount >= invite.maxUses);

  if (invalid) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-5 text-center">
        <h1 className="text-xl font-semibold text-ink">This invite link is no longer valid</h1>
        <p className="mt-2 text-sm text-muted">It may have expired or reached its usage limit.</p>
      </main>
    );
  }

  const jar = await cookies();
  jar.set('invite_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 3600, path: '/' });

  const session = await auth();
  if (session?.user?.id) redirect('/welcome');

  redirect('/signup');
}
