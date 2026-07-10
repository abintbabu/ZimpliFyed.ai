'use server';

import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getBillingProvider } from '@/lib/billing/stripe-adapter';
import type { OveragePack } from '@/lib/billing/provider';
import type { TenantPlan } from '@prisma/client';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export async function startCheckoutAction(plan: TenantPlan) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'users:manage')) throw new Error('Only owners and admins can manage billing');
  if (plan === 'free') throw new Error('Free plan does not require checkout');

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  const base = appUrl();

  return getBillingProvider().createCheckout({
    tenantId: session.tenantId,
    plan,
    customerEmail: user?.email ?? undefined,
    successUrl: `${base}/dashboard/settings/billing?checkout=success`,
    cancelUrl: `${base}/dashboard/settings/billing?checkout=cancelled`,
  });
}

export async function startOverageCheckoutAction(pack: OveragePack) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'users:manage')) throw new Error('Only owners and admins can manage billing');

  const base = appUrl();
  return getBillingProvider().createOverageCheckout({
    tenantId: session.tenantId,
    pack,
    successUrl: `${base}/dashboard/settings/billing?checkout=success`,
    cancelUrl: `${base}/dashboard/settings/billing?checkout=cancelled`,
  });
}

export async function openBillingPortalAction() {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'users:manage')) throw new Error('Only owners and admins can manage billing');

  const base = appUrl();
  return getBillingProvider().openPortal({ tenantId: session.tenantId, returnUrl: `${base}/dashboard/settings/billing` });
}
