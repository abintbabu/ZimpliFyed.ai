import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Two-tenant team fixture for exercising multi-tenancy and team safety by hand.
 *
 * `npm run db:seed` gives one workspace with two logins — enough to see the dashboard, not enough
 * to test any of the things that actually break in a team: whether a Sales user can reach the
 * members screen, whether the last owner can lock the workspace, whether tenant A's owner can see
 * tenant B's buyers. This seeds both tenants, every staff role, pending invites in several states,
 * and business data on both sides so cross-tenant reads have something to wrongly return.
 *
 *   npm run seed:team              # create/update the fixture
 *   npm run seed:team -- --clear   # remove it
 *
 * Refuses to touch a non-local database unless --force is passed, because it writes users and
 * memberships: `DATABASE_URL` in this project points at a shared Supabase pooler by default.
 *
 * Every login uses the password below. Sign in at the tenant's own host, e.g.
 *   http://acme-exports.localhost:3000  (needs ALLOW_DEV_TENANT_FALLBACK=1 or a hosts entry)
 */

const PASSWORD = 'Fixture@123';

const TENANTS = [
  {
    slug: 'acme-exports',
    name: 'Acme Exports',
    plan: 'growth' as const,
    status: 'active' as const,
    businessType: 'merchant' as const,
    members: [
      { local: 'owner', role: 'owner' as const, name: 'Asha Owner' },
      { local: 'admin', role: 'admin' as const, name: 'Arun Admin' },
      { local: 'ops', role: 'ops_admin' as const, name: 'Omar Ops' },
      { local: 'sales', role: 'sales' as const, name: 'Sana Sales' },
      { local: 'finance', role: 'finance' as const, name: 'Farid Finance' },
      { local: 'viewer', role: 'viewer' as const, name: 'Vik Viewer' },
    ],
  },
  {
    slug: 'rival-textiles',
    name: 'Rival Textiles',
    plan: 'starter' as const,
    status: 'active' as const,
    businessType: 'manufacturer' as const,
    // Deliberately a single owner: this is the tenant to test the last-owner guard against
    // (demoting or removing this member must be refused).
    members: [{ local: 'owner', role: 'owner' as const, name: 'Rhea Rival' }],
  },
  {
    slug: 'lapsed-traders',
    name: 'Lapsed Traders',
    plan: 'starter' as const,
    // Suspended on purpose: every app page must refuse, while billing and data export still work.
    status: 'suspended' as const,
    businessType: 'merchant' as const,
    members: [{ local: 'owner', role: 'owner' as const, name: 'Lata Lapsed' }],
  },
];

async function main() {
  const clear = process.argv.includes('--clear');
  const force = process.argv.includes('--force');

  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL is not set (check .env.local)');
  const isLocal = /@(127\.0\.0\.1|localhost|::1)[:/]/.test(url);
  if (!isLocal && !force) {
    console.error(`Refusing to seed a non-local database: ${url.replace(/:[^:@/]+@/, ':****@')}`);
    console.error('This writes users and memberships. Re-run with --force only if that is really what you want.');
    process.exit(1);
  }

  // Deferred until after dotenv runs — src/lib/prisma reads DATABASE_URL at import time.
  const { prisma } = await import('../src/lib/prisma');
  const { seedDemoData } = await import('../src/lib/seed-demo');
  const bcrypt = (await import('bcryptjs')).default;

  const slugs = TENANTS.map((t) => t.slug);

  if (clear) {
    const tenants = await prisma.tenant.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    for (const t of tenants) {
      // Memberships and invites cascade from Tenant; users are global so they're removed by email.
      await prisma.tenant.delete({ where: { id: t.id } });
      console.log(`removed tenant ${t.slug}`);
    }
    const emails = TENANTS.flatMap((t) => t.members.map((m) => `${m.local}@${t.slug}.test`));
    const { count } = await prisma.user.deleteMany({ where: { email: { in: emails } } });
    console.log(`removed ${count} fixture user(s)`);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const lines: string[] = [];

  for (const spec of TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: spec.slug },
      create: { slug: spec.slug, name: spec.name, plan: spec.plan, status: spec.status },
      update: { name: spec.name, plan: spec.plan, status: spec.status },
    });

    for (const m of spec.members) {
      const email = `${m.local}@${spec.slug}.test`;
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, name: m.name, password: passwordHash, emailVerified: new Date() },
        update: { name: m.name, password: passwordHash },
      });
      await prisma.membership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        create: { userId: user.id, tenantId: tenant.id, role: m.role },
        update: { role: m.role },
      });
      lines.push(`  ${email.padEnd(34)} ${m.role}`);
    }

    // Business data on both sides, so a cross-tenant read has something to wrongly return — an
    // isolation bug against two empty tenants looks identical to correct behaviour.
    await seedDemoData(tenant.id, spec.businessType);

    console.log(`tenant ready: ${spec.slug} (${spec.status}, ${spec.plan}) — ${spec.members.length} member(s)`);
  }

  // ── Invites in each state worth clicking through ────────────────────────────
  const acme = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'acme-exports' }, select: { id: true } });
  const acmeOwner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@acme-exports.test' }, select: { id: true } });
  const day = 86_400_000;

  const invites = [
    // Live, targeted: redeemable only by this address (canRedeemInvite binds it).
    { email: 'pending@acme-exports.test', role: 'sales' as const, token: 'fixture-live-targeted', expiresAt: new Date(Date.now() + 14 * day), maxUses: null },
    // Expired: /join must refuse it and the members screen should show the past date.
    { email: 'expired@acme-exports.test', role: 'viewer' as const, token: 'fixture-expired', expiresAt: new Date(Date.now() - day), maxUses: null },
    // Open link invite with uses left — a bearer token by design, redeemable by anyone.
    { email: null, role: 'viewer' as const, token: 'fixture-link-open', expiresAt: new Date(Date.now() + 14 * day), maxUses: 5 },
    // Open link invite already exhausted: isInviteUsable must refuse it.
    { email: null, role: 'viewer' as const, token: 'fixture-link-used-up', expiresAt: new Date(Date.now() + 14 * day), maxUses: 1 },
  ];

  for (const inv of invites) {
    await prisma.invite.deleteMany({ where: { tenantId: acme.id, token: inv.token } });
    await prisma.invite.create({
      data: {
        tenantId: acme.id,
        email: inv.email,
        role: inv.role,
        token: inv.token,
        expiresAt: inv.expiresAt,
        maxUses: inv.maxUses,
        useCount: inv.token === 'fixture-link-used-up' ? 1 : 0,
        invitedByUserId: acmeOwner.id,
      },
    });
  }
  console.log(`seeded ${invites.length} invite(s) on acme-exports`);

  console.log(`\nAll logins use password: ${PASSWORD}\n`);
  console.log(lines.join('\n'));
  console.log(`
Things this fixture is set up to test:
  cross-tenant      sign in as owner@acme-exports.test, then try to read Rival Textiles' data
  role gating       sales@acme-exports.test must not reach /dashboard/users
  last owner        owner@rival-textiles.test cannot be demoted or removed (only owner)
  owner escalation  admin@acme-exports.test cannot grant or remove the owner role
  offboarding       remove viewer@acme-exports.test — access must end on their next request
  suspension        owner@lapsed-traders.test: app pages refuse, billing + export still work
  invites           /join/fixture-live-targeted (bound to one address),
                    /join/fixture-expired and /join/fixture-link-used-up (both refused),
                    /join/fixture-link-open (open bearer link)
`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
