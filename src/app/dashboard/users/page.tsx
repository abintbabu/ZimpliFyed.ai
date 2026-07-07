import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission, ROLE_LABELS } from '@/lib/permissions';
import { listMembers, listPendingInvites } from '@/actions/users';
import { InviteUserForm } from './invite-form';
import { RevokeInviteButton } from './revoke-invite-button';
import { RoleSelect } from './role-select';

export default async function UsersPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'users:manage')) redirect('/dashboard');
  const canManageRoles = hasPermission(role, 'roles:manage');

  const [members, invites] = await Promise.all([
    listMembers(tenantId),
    listPendingInvites(tenantId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Users</h1>
      </div>

      <InviteUserForm />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Members</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-4 py-2 text-ink">{m.user.name ?? '—'}</td>
                  <td className="px-4 py-2 text-ink">{m.user.email}</td>
                  <td className="px-4 py-2 text-muted">
                    {canManageRoles ? <RoleSelect membershipId={m.id} role={m.role} /> : ROLE_LABELS[m.role]}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-muted">No members yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Pending invites</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-4 py-2 text-ink">{i.email}</td>
                    <td className="px-4 py-2 text-muted">{ROLE_LABELS[i.role]}</td>
                    <td className="px-4 py-2 text-right"><RevokeInviteButton inviteId={i.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
