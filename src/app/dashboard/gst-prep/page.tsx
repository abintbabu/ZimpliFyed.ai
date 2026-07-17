import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getGstPrepPack } from '@/actions/gst-prep';
import { GstPrepView } from './gst-prep-view';

/** Current month as "YYYY-MM" in UTC — the default prep period. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function GstPrepPage() {
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'compliance:read')) redirect('/dashboard');

  const period = currentPeriod();
  const pack = await getGstPrepPack(period);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">GST filing prep</h1>
        <p className="text-sm text-muted">
          A working summary of the month&apos;s input credit and zero-rated exports to hand to your CA — not a filed return.
        </p>
      </div>

      <GstPrepView initialPeriod={period} initialPack={pack} />
    </div>
  );
}
