import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission, ROLE_LABELS } from '@/lib/permissions';
import { listMembers, listPendingInvites } from '@/actions/users';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Users } from 'lucide-react';
import { InviteUserForm } from './invite-form';
import { RevokeInviteButton } from './revoke-invite-button';
import { RoleSelect } from './role-select';
import { RemoveMemberButton } from './remove-member-button';
import { CopyInviteLink } from './copy-invite-link';

type Member = Awaited<ReturnType<typeof listMembers>>[number];
type Invite = Awaited<ReturnType<typeof listPendingInvites>>[number];

export default async function UsersPage() {
  const { role, userId } = await requireTenantSession();
  if (!hasPermission(role, 'members:invite')) redirect('/dashboard');
  const canManageRoles = hasPermission(role, 'roles:assign');
  const canRemove = hasPermission(role, 'members:remove');

  const [members, invites] = await Promise.all([
    listMembers(),
    listPendingInvites(),
  ]);

  const memberColumns: DataTableColumn<Member>[] = [
    { key: 'name', header: 'Name', render: (m) => <span className="text-ink">{m.user.name ?? '—'}</span> },
    { key: 'email', header: 'Email', render: (m) => <span className="text-ink">{m.user.email}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (m) => (canManageRoles ? <RoleSelect membershipId={m.id} role={m.role} /> : ROLE_LABELS[m.role]),
    },
    ...(canRemove
      ? [{
          key: 'actions',
          header: '',
          align: 'right' as const,
          render: (m: Member) => (
            <RemoveMemberButton membershipId={m.id} email={m.user.email} isSelf={m.userId === userId} />
          ),
        }]
      : []),
  ];

  const inviteColumns: DataTableColumn<Invite>[] = [
    { key: 'email', header: 'Email', render: (i) => <span className="text-ink">{i.email ?? 'Link invite'}</span> },
    { key: 'role', header: 'Role', render: (i) => ROLE_LABELS[i.role] },
    {
      key: 'expires',
      header: 'Expires',
      render: (i) =>
        i.expiresAt ? (
          <span className="text-muted">{i.expiresAt.toLocaleDateString()}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'link', header: '', align: 'right', render: (i) => <CopyInviteLink token={i.token} /> },
    { key: 'actions', header: '', align: 'right', render: (i) => <RevokeInviteButton inviteId={i.id} /> },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Users" />

      <InviteUserForm />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Members</h2>
        <DataTable
          columns={memberColumns}
          rows={members}
          rowKey={(m) => m.id}
          empty={<EmptyState icon={Users} title="No members yet" description="Invite teammates to collaborate on this workspace." />}
        />
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Pending invites</h2>
          <DataTable columns={inviteColumns} rows={invites} rowKey={(i) => i.id} />
        </section>
      )}
    </div>
  );
}
