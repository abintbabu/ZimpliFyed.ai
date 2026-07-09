import { config } from "dotenv";
config({ path: ".env.local" });

const users = [
  { name: "Jerome Cherian", email: "jerome@zimplifyed.ai", password: "Jerome#Export2026", role: "admin" as const },
  { name: "Raijo Philip", email: "raijo@zimplifyed.ai", password: "Raijo#Export2026", role: "admin" as const },
  { name: "Arun George", email: "arun@zimplifyed.ai", password: "Arun#Export2026", role: "admin" as const },
  { name: "Abin Babu", email: "abin@zimplifyed.ai", password: "Abin#Export2026", role: "super_admin" as const },
];

async function main() {
  // Deferred until after dotenv config runs — src/lib/prisma reads DATABASE_URL at import time.
  const { prisma } = await import("../src/lib/prisma");
  const { DEV_TENANT_SLUG } = await import("../src/lib/tenant-resolver");
  const bcrypt = (await import("bcryptjs")).default;

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    create: { slug: DEV_TENANT_SLUG, name: "Demo Tenant" },
    update: {},
  });

  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { name: u.name, email: u.email, password: hashed },
      update: { name: u.name, password: hashed },
    });
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      create: { userId: user.id, tenantId: tenant.id, role: u.role },
      update: { role: u.role },
    });
    console.log(`${u.name} <${u.email}> — role ${u.role} — tenant ${tenant.slug}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
