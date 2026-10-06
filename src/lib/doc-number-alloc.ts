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
    case 'GRN': {
      const start = (await prisma.goodsReceipt.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.goodsReceipt.findFirst({ where: { tenantId, receiptNumber: n }, select: { id: true } })));
    }
    case 'IMP': {
      const start = (await prisma.importEntry.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.importEntry.findFirst({ where: { tenantId, entryNumber: n }, select: { id: true } })));
    }
    case 'RUN': {
      const start = (await prisma.productionRun.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.productionRun.findFirst({ where: { tenantId, runNumber: n }, select: { id: true } })));
    }
    case 'QC': {
      const start = (await prisma.qcInspection.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.qcInspection.findFirst({ where: { tenantId, inspectionNumber: n }, select: { id: true } })));
    }
    case 'BILL': {
      // Vendor bills carry the SUPPLIER's own number, so there is nothing to allocate; this branch only
      // exists to keep the prefix union exhaustive.
      throw new Error('Vendor bills use the supplier\'s own bill number');
    }
    case 'PO': {
      const start = (await prisma.purchaseOrder.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.purchaseOrder.findFirst({ where: { tenantId, poNumber: n }, select: { id: true } })));
    }
    case 'INV': {
      const start = (await prisma.invoice.count({ where: { tenantId } })) + 1;
      return pickFreeDocNumber(prefix, start, now, async (n) => !!(await prisma.invoice.findFirst({ where: { tenantId, invoiceNumber: n }, select: { id: true } })));
    }
  }
}
