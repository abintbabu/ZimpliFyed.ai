import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { isPlatformAdmin } from '@/lib/platform/admin';
import { auth } from '@/auth';

/**
 * Platform-admin console shell (SELF_SERVE_PLAN §6). Gated on `platform_admin`
 * — a Zimplifyed-employee capability that is never derived from any tenant
 * role, so a tenant owner can never reach these surfaces. Deliberately its own
 * chrome (not the tenant DashboardShell): this is internal tooling.
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!(await isPlatformAdmin())) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <header className="border-b border-line bg-canvas dark:bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-brand" />
            <span>Zimplifyed Admin</span>
          </Link>
          <div className="flex items-center gap-4 text-xs text-muted">
            <Link href="/admin" className="hover:text-ink">Tenants</Link>
            <Link href="/admin/analytics" className="hover:text-ink">Signup funnel</Link>
            <Link href="/admin/audit" className="hover:text-ink">Platform audit</Link>
            <Link href="/dashboard" className="hover:text-ink">← Back to app</Link>
            <span className="text-ink-soft">{session.user.email}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
