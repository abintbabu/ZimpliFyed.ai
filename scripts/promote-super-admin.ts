import { prisma } from "../src/lib/prisma";
import { DEV_TENANT_SLUG } from "../src/lib/tenant-resolver";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run promote -- <email> [tenantSlug]");
    process.exit(1);
  }
  const tenantSlug = process.argv[3] ?? DEV_TENANT_SLUG;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No User row for ${email} yet — sign in with Google once first.`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: tenantSlug } });

  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, role: "super_admin" },
    update: { role: "super_admin" },
  });

  console.log(`${email} is now super_admin in tenant "${tenant.slug}" (membership ${membership.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
