import { prisma } from "../src/lib/prisma";
import { DEV_TENANT_SLUG } from "../src/lib/tenant-resolver";

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    create: { slug: DEV_TENANT_SLUG, name: "Demo Workspace", plan: "free", status: "trial" },
    update: {},
  });
  console.log(`Tenant ready: ${tenant.slug} (${tenant.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
