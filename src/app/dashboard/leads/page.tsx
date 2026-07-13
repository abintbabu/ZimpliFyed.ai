import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listLeads } from '@/actions/leads';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from './lead-stages';
import { LeadCard } from './lead-card';
import { NewLeadForm } from './new-lead-form';
import { PasteEnquiryBox } from './paste-enquiry-box';

export default async function LeadsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'leads:read')) {
    return <p className="text-sm text-muted">You do not have access to leads.</p>;
  }

  const canWrite = hasPermission(role, 'leads:write');
  const canQuote = hasPermission(role, 'quotes:write');
  const leads = await listLeads(tenantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Leads</h1>
        {canWrite && <NewLeadForm />}
      </div>

      {canQuote && <PasteEnquiryBox />}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage);
          return (
            <div key={stage} className="w-64 shrink-0 space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                {LEAD_STAGE_LABELS[stage]} · {stageLeads.length}
              </p>
              <div className="space-y-2">
                {stageLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} canWrite={canWrite} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
