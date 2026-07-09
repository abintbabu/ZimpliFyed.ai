import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { joinByDomain } from '@/actions/onboarding';

export const metadata = { title: 'Join your team' };
export const dynamic = 'force-dynamic';

export default async function JoinChoicePage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { tenant: slug } = await searchParams;
  if (!slug) redirect('/welcome/create');

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { name: true, slug: true } });
  if (!tenant) redirect('/welcome/create');

  async function join() {
    'use server';
    await joinByDomain(tenant!.slug);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-5 py-16">
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-sm animate-rise text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Your team is already on <span className="text-gradient">Zimplifyed</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Colleagues at your company already use <span className="font-medium text-ink">{tenant.name}</span>.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 text-left shadow-[0_24px_60px_-30px_rgba(15,23,42,0.22)]">
          <form action={join}>
            <button className="w-full rounded-lg bg-brand-gradient py-2.5 text-sm font-semibold text-white">
              Join {tenant.name}
            </button>
          </form>
          <Link
            href="/welcome/create"
            className="mt-3 block rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink-soft hover:border-brand"
          >
            Create my own workspace instead
          </Link>
        </div>
      </div>
    </main>
  );
}
