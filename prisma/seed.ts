import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Deferred until after dotenv config runs — src/lib/prisma reads DATABASE_URL at import time.
  const { prisma } = await import("../src/lib/prisma");
  const { DEV_TENANT_SLUG } = await import("../src/lib/tenant-resolver");

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    create: { slug: DEV_TENANT_SLUG, name: "Demo Workspace", plan: "free", status: "trial" },
    update: {},
  });
  console.log(`Tenant ready: ${tenant.slug} (${tenant.id})`);

  const vendor = await prisma.vendor.upsert({
    where: { id: `${tenant.id}-demo-vendor` },
    create: {
      id: `${tenant.id}-demo-vendor`,
      tenantId: tenant.id,
      name: "Sunrise Textiles Pvt Ltd",
      contactName: "Ravi Kumar",
      email: "ravi@sunrisetextiles.example",
      phone: "+91 98765 43210",
    },
    update: {},
  });

  await prisma.vendorRate.upsert({
    where: { id: `${tenant.id}-demo-rate` },
    create: {
      id: `${tenant.id}-demo-rate`,
      tenantId: tenant.id,
      vendorId: vendor.id,
      sku: "Cotton Bath Towel 500GSM",
      method: "per_piece",
      baseRate: 2.4,
      normalizedPieceCost: 2.4,
      moqPieces: 5000,
      leadTimeDays: 21,
      isPreferred: true,
    },
    update: {},
  });

  const quote = await prisma.quote.upsert({
    where: { id: `${tenant.id}-demo-quote` },
    create: {
      id: `${tenant.id}-demo-quote`,
      tenantId: tenant.id,
      quoteNumber: "Q-DEMO-001",
      status: "accepted",
      currency: "USD",
      total: 4800,
      overallMarginPct: 18,
      lines: {
        create: [
          {
            description: "Cotton Bath Towel 500GSM",
            quantity: 2000,
            cost: 2.4,
            expensePct: 5,
            marginPct: 18,
            unitPrice: 2.9,
            lineTotal: 5800,
          },
        ],
      },
    },
    update: {},
  });

  const order = await prisma.order.upsert({
    where: { id: `${tenant.id}-demo-order` },
    create: {
      id: `${tenant.id}-demo-order`,
      tenantId: tenant.id,
      orderNumber: "ORD-DEMO-001",
      status: "in_production",
      product: "Cotton Bath Towel 500GSM",
      quantity: 2000,
      unit: "pcs",
      incoterm: "FOB",
      destination: "Rotterdam, Netherlands",
      originPort: "Nhava Sheva",
      destPort: "Rotterdam",
      quote: { connect: { id: quote.id } },
    },
    update: {},
  });

  await prisma.invoice.upsert({
    where: { id: `${tenant.id}-demo-invoice` },
    create: {
      id: `${tenant.id}-demo-invoice`,
      tenantId: tenant.id,
      invoiceNumber: "INV-DEMO-001",
      orderId: order.id,
      status: "sent",
      currency: "USD",
      total: 5800,
      balanceDue: 5800,
      lines: {
        create: [
          {
            description: "Cotton Bath Towel 500GSM",
            quantity: 2000,
            cost: 2.4,
            expensePct: 5,
            marginPct: 18,
            unitPrice: 2.9,
            lineTotal: 5800,
          },
        ],
      },
    },
    update: {},
  });

  console.log("Demo vendor/quote/order/invoice ready.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
