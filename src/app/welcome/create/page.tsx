import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { CreateOrgWizard } from './wizard';

export const metadata = { title: 'Create your organization' };
export const dynamic = 'force-dynamic';

export default async function CreateOrgPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-5 py-16">
      <div className="glow-brand pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-lg animate-rise">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Set up your <span className="text-gradient">workspace</span>
          </h1>
          <p className="mt-2 text-sm text-muted">Takes about a minute. You can change everything later.</p>
        </div>
        <CreateOrgWizard defaultName={session.user.name ?? ''} />
      </div>
    </main>
  );
}
