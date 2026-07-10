import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// DOC_ENGINE_SPEC §1.1 — the single typed snapshot every doc template will
// read from. This is step 1 of the spec's build order: DocContext + the
// fix-list UX, valuable on its own before any template/PDF work exists.

const nonEmpty = z.string().trim().min(1);

const TenantIdentitySchema = z.object({
  legalName: nonEmpty,
  registeredAddress: nonEmpty,
  iecNumber: nonEmpty,
  gstin: nonEmpty,
  adCode: nonEmpty,
  bankName: nonEmpty,
  bankAccountNumber: nonEmpty,
  bankIfscOrSwift: nonEmpty,
});

const BuyerSchema = z.object({
  name: nonEmpty,
  country: nonEmpty,
  address: nonEmpty,
});

const ShipmentSchema = z.object({
  incoterm: nonEmpty,
  originPort: nonEmpty,
  destPort: nonEmpty,
  destination: nonEmpty,
});

const LineItemSchema = z.object({
  description: nonEmpty,
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  hsCode: nonEmpty,
});

export const DocContextSchema = z.object({
  tenant: TenantIdentitySchema,
  buyer: BuyerSchema,
  shipment: ShipmentSchema,
  currency: nonEmpty,
  lines: z.array(LineItemSchema).min(1),
});

export type DocContext = z.infer<typeof DocContextSchema>;

export type MissingField = {
  /** Dot-path into the raw context, e.g. "tenant.iecNumber" or "lines[0].hsCode". */
  path: string;
  label: string;
  fixHref: string;
};

export type DocContextResult =
  | { ok: true; context: DocContext }
  | { ok: false; missing: MissingField[] };

const FIELD_LABELS: Record<string, { label: string; fixHref: string }> = {
  'tenant.legalName': { label: 'Legal entity name', fixHref: '/dashboard/settings' },
  'tenant.registeredAddress': { label: 'Registered address', fixHref: '/dashboard/settings' },
  'tenant.iecNumber': { label: 'IEC number', fixHref: '/dashboard/settings' },
  'tenant.gstin': { label: 'GSTIN', fixHref: '/dashboard/settings' },
  'tenant.adCode': { label: 'AD code', fixHref: '/dashboard/settings' },
  'tenant.bankName': { label: 'Bank name', fixHref: '/dashboard/settings' },
  'tenant.bankAccountNumber': { label: 'Bank account number', fixHref: '/dashboard/settings' },
  'tenant.bankIfscOrSwift': { label: 'Bank IFSC/SWIFT', fixHref: '/dashboard/settings' },
  'buyer.name': { label: 'Buyer name', fixHref: '/dashboard/buyers' },
  'buyer.country': { label: 'Buyer country', fixHref: '/dashboard/buyers' },
  'buyer.address': { label: 'Buyer address', fixHref: '/dashboard/buyers' },
  'shipment.incoterm': { label: 'Incoterm', fixHref: '' },
  'shipment.originPort': { label: 'Origin port', fixHref: '' },
  'shipment.destPort': { label: 'Destination port', fixHref: '' },
  'shipment.destination': { label: 'Destination country', fixHref: '' },
  lines: { label: 'At least one line item on the quote', fixHref: '' },
};

function lineLabel(index: number, key: string) {
  const names: Record<string, string> = {
    description: 'Description',
    quantity: 'Quantity',
    unitPrice: 'Unit price',
    hsCode: 'HS code',
  };
  return `Line ${index + 1}: ${names[key] ?? key}`;
}

/**
 * Assembles the DocContext for an order and validates it. Returns a fix-list
 * ("Add your AD code → Settings") instead of a hard error when required
 * fields are missing — that fix-list IS the UX per DOC_ENGINE_SPEC §1.1.
 */
export async function buildDocContext(tenantId: string, orderId: string): Promise<DocContextResult> {
  const [tenant, order] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        buyer: true,
        quote: { include: { lines: { include: { product: { include: { hsCode: true } } } } } },
      },
    }),
  ]);

  if (!tenant) throw new Error('Tenant not found');
  if (!order) throw new Error('Order not found');

  const orderFixHref = `/dashboard/orders/${orderId}`;

  const raw = {
    tenant: {
      legalName: tenant.legalName ?? '',
      registeredAddress: tenant.registeredAddress ?? '',
      iecNumber: tenant.iecNumber ?? '',
      gstin: tenant.gstin ?? '',
      adCode: tenant.adCode ?? '',
      bankName: tenant.bankName ?? '',
      bankAccountNumber: tenant.bankAccountNumber ?? '',
      bankIfscOrSwift: tenant.bankIfscOrSwift ?? '',
    },
    buyer: {
      name: order.buyer?.name ?? '',
      country: order.buyer?.country ?? '',
      address: order.buyer?.address ?? '',
    },
    shipment: {
      incoterm: order.incoterm ?? '',
      originPort: order.originPort ?? '',
      destPort: order.destPort ?? '',
      destination: order.destination ?? '',
    },
    currency: order.quote?.currency ?? '',
    lines: (order.quote?.lines ?? []).map((l) => ({
      description: l.description ?? '',
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      hsCode: l.product?.hsCode?.hsCode ?? '',
    })),
  };

  const parsed = DocContextSchema.safeParse(raw);
  if (parsed.success) return { ok: true, context: parsed.data };

  const missing: MissingField[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.');
    if (path.startsWith('lines')) {
      const [, indexStr, key] = issue.path as (string | number)[];
      if (typeof indexStr === 'number' && typeof key === 'string') {
        missing.push({ path, label: lineLabel(indexStr, key), fixHref: order.quote ? `/dashboard/quotes/${order.quote.id}` : orderFixHref });
        continue;
      }
      missing.push({ path: 'lines', label: FIELD_LABELS.lines.label, fixHref: order.quote ? `/dashboard/quotes/${order.quote.id}` : orderFixHref });
      continue;
    }
    const known = FIELD_LABELS[path];
    if (known) {
      missing.push({ path, label: known.label, fixHref: known.fixHref || orderFixHref });
    } else {
      missing.push({ path, label: path, fixHref: orderFixHref });
    }
  }

  // De-dupe (Zod can emit multiple issues for the same path).
  const seen = new Set<string>();
  const deduped = missing.filter((m) => (seen.has(m.path) ? false : (seen.add(m.path), true)));

  return { ok: false, missing: deduped };
}
