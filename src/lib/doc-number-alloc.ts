import 'server-only';
import { prisma } from '@/lib/prisma';
import { pickFreeDocNumber, type DocNumberPrefix } from '@/lib/doc-number';

/** Next free working number for a tenant: count + 1, walked forward past any collision. */
export async function allocateDocNumber(tenantId: string, prefix: DocNumberPrefix): Promise<string> {
  const now = new Date();
  switch (prefix) {
    case 'QT': {
      const start = (await prisma.quote.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.quote.findFirst({ where: { tenantId, quoteNumber: n }, select: { id: true } })));
    }
    case 'ORD': {
      const start = (await prisma.order.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.order.findFirst({ where: { tenantId, orderNumber: n }, select: { id: true } })));
    }
    case 'SHP': {
      const start = (await prisma.shipment.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.shipment.findFirst({ where: { tenantId, shipmentNumber: n }, select: { id: true } })));
    }
    case 'INV': {
      const start = (await prisma.invoice.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.invoice.findFirst({ where: { tenantId, invoiceNumber: n }, select: { id: true } })));
    }
  }
}
