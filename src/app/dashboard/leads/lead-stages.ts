import type { LeadStage } from '@prisma/client';

export const LEAD_STAGES: LeadStage[] = [
  'New',
  'Quoted_Invoice',
  'Follow_Up',
  'Sample_Requested',
  'Insufficient_Info',
  'In_Production',
  'Shipped',
  'Lost',
];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  New: 'New',
  Quoted_Invoice: 'Quoted / Invoice',
  Follow_Up: 'Follow Up',
  Sample_Requested: 'Sample Requested',
  Insufficient_Info: 'Insufficient Info',
  In_Production: 'In Production',
  Shipped: 'Shipped',
  Lost: 'Lost',
};
