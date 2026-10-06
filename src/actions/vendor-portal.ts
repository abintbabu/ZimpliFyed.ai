'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { generateInviteToken, hashInviteToken, looksLikeInviteToken, inviteExpiry, inviteUsable } from '@/lib/invite-token';
import { INCOTERMS } from '@/lib/landed-cost';

/**
 * Staff action: mint a no-login quote link for one invited vendor. The raw token is returned ONCE and only its
 * SHA-256 is stored, so a database leak cannot be replayed. Re-issuing replaces the previous link.
 */
export async function createVendorPortalLink(rfqId: string, vendorId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'vendors:write')) throw new Error('You do not have permission to invite vendors');

  const rfq = await prisma.vendorRfq.findFirst({ where: { id: rfqId, tenantId }, select: { id: true, rfqNumber: true, status: true } });
  if (!rfq) throw new Error('RFQ not found');
  if (rfq.status !== 'open') throw new Error('Only an open RFQ can be sent to vendors');
  const invite = await prisma.vendorRfqInvite.findFirst({ where: { rfqId, vendorId, vendor: { tenantId } }, select: { id: true } });
  if (!invite) throw new Error('That vendor is not invited to this RFQ');

  const token = generateInviteToken();
  await prisma.vendorRfqInvite.update({ where: { id: invite.id }, data: { token: hashInviteToken(token), tokenExpiresAt: inviteExpiry(new Date()) } });
  await writeAudit({ session, collection: 'vendor_rfqs', documentId: rfqId, action: 'send_email', summary: `Issued a vendor portal link for RFQ ${rfq.rfqNumber}`, after: { vendorId } });
  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  return { path: `/vendor-quote/${token}` };
}

async function loadInvite(token: string) {
  if (!looksLikeInviteToken(token)) return null;
  return prisma.vendorRfqInvite.findUnique({ // tenant-safe: vendor-facing public token lookup, intentionally cross-tenant; token is a 192-bit secret stored hashed
    where: { token: hashInviteToken(token) },
    include: { vendor: { select: { id: true, name: true } }, rfq: { select: { id: true, tenantId: true, rfqNumber: true, title: true, description: true, quantity: true, unit: true, targetPrice: false, dueDate: true, status: true } } },
  });
}

/** Vendor-facing, unauthenticated. Exposes only what the vendor needs to quote — never our target price. */
export async function getVendorPortalRfq(token: string) {
  const invite = await loadInvite(token);
  if (!invite) return null;
  const usable = inviteUsable({ tokenExpiresAt: invite.tokenExpiresAt, now: new Date(), rfqOpen: invite.rfq.status === 'open' });
  const tenant = await prisma.tenant.findUnique({ where: { id: invite.rfq.tenantId }, select: { legalName: true, name: true } });
  const existing = await prisma.vendorRfqQuote.findFirst({ where: { rfqId: invite.rfq.id, vendorId: invite.vendor.id }, select: { rate: true, moqPieces: true, leadTimeDays: true, incoterm: true, notes: true } }); // tenant-safe: ids come from the verified invite above
  return {
    usable,
    buyerName: tenant?.legalName ?? tenant?.name ?? 'The buyer',
    vendorName: invite.vendor.name,
    rfq: { rfqNumber: invite.rfq.rfqNumber, title: invite.rfq.title, description: invite.rfq.description, quantity: invite.rfq.quantity, unit: invite.rfq.unit, dueDate: invite.rfq.dueDate },
    existing,
  };
}

export async function submitVendorPortalQuote(token: string, input: { rate: number; moqPieces?: number | null; leadTimeDays?: number | null; incoterm?: string; notes?: string }) {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  // Two limits: per link (stops hammering one token) and per IP (stops sweeping for tokens).
  const [byToken, byIp] = await Promise.all([
    checkRateLimitDb(`vendorquote:t:${hashInviteToken(token).slice(0, 16)}`, 10, 60 * 60_000),
    checkRateLimitDb(`vendorquote:ip:${ip}`, 30, 60 * 60_000),
  ]);
  if (!byToken.allowed || !byIp.allowed) throw new Error('Too many attempts — please try again later.');

  const invite = await loadInvite(token);
  if (!invite) throw new Error('This link is not valid.');
  const usable = inviteUsable({ tokenExpiresAt: invite.tokenExpiresAt, now: new Date(), rfqOpen: invite.rfq.status === 'open' });
  if (!usable.ok) throw new Error(usable.reason ?? 'This link cannot be used.');

  if (!Number.isFinite(input.rate) || !(input.rate > 0) || input.rate > 1e9) throw new Error('Enter a valid unit price.');
  const moq = input.moqPieces ?? null;
  if (moq != null && (!Number.isInteger(moq) || moq <= 0 || moq > 1e9)) throw new Error('Minimum order quantity must be a whole number.');
  const lead = input.leadTimeDays ?? null;
  if (lead != null && (!Number.isInteger(lead) || lead < 0 || lead > 730)) throw new Error('Lead time must be 0–730 days.');
  const incoterm = (input.incoterm ?? 'EXW').toUpperCase();
  if (!(INCOTERMS as readonly string[]).includes(incoterm)) throw new Error('Choose a valid Incoterm.');
  const notes = (input.notes ?? '').trim().slice(0, 1000) || null;

  const data = { rate: input.rate, moqPieces: moq, leadTimeDays: lead, incoterm, notes };
  await prisma.vendorRfqQuote.upsert({ // tenant-safe: rfqId/vendorId come from the verified invite above
    where: { rfqId_vendorId: { rfqId: invite.rfq.id, vendorId: invite.vendor.id } },
    create: { rfqId: invite.rfq.id, vendorId: invite.vendor.id, ...data },
    update: data,
  });
  await writeDomainEvent(prisma, { tenantId: invite.rfq.tenantId, type: 'vendor_rfq.quote_received', refId: invite.rfq.id, payload: { vendorId: invite.vendor.id, rate: input.rate } });
  return { ok: true };
}
