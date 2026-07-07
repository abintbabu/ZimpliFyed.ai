import type { ShipmentMilestoneType } from '@prisma/client';

// Canonical order milestones occur in — drives both the staff timeline and the buyer-facing view.
export const MILESTONE_ORDER: ShipmentMilestoneType[] = [
  'gate_in',
  'sob',
  'transhipment',
  'arrival',
  'do_issued',
  'delivered',
];

export const MILESTONE_LABELS: Record<ShipmentMilestoneType, string> = {
  gate_in: 'Gate in',
  sob: 'Shipped on board',
  transhipment: 'Transhipment',
  arrival: 'Arrival',
  do_issued: 'Delivery order issued',
  delivered: 'Delivered',
};
