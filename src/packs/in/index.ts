import type { CountryPack } from '../types';

// India tax-id / registration validators (COUNTRY_PACK_SPEC §1.4).
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IEC_RE = /^[A-Z0-9]{10}$/; // post-2017 IEC = PAN, 10 chars
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const indiaPack: CountryPack = {
  id: 'in',
  label: 'India',
  locale: 'en-IN',
  currencyDefault: 'INR',
  capabilities: {
    docSets: true,
    incentives: true,
    complianceCalendar: true,
    hsLookup: true,
    aiCorpus: 'partial',
  },
  complianceSeeds: [
    { category: 'iec', name: 'Importer Exporter Code (IEC)', issuingAuthority: 'DGFT', renewalLeadDays: 60 },
    { category: 'ad_code', name: 'AD Code (port registration)', issuingAuthority: 'Authorized Dealer Bank', renewalLeadDays: 30 },
    { category: 'gst_lut', name: 'Letter of Undertaking (LUT)', issuingAuthority: 'GST Dept', renewalLeadDays: 45 },
    { category: 'rcmc', name: 'RCMC (Export Promotion Council)', issuingAuthority: 'EPC', renewalLeadDays: 60 },
  ],
  incentiveSchemes: [
    { type: 'rodtep', label: 'RoDTEP', rateForHsCode: () => null },
    { type: 'drawback', label: 'Duty Drawback', rateForHsCode: () => null },
  ],
  fieldValidators: {
    gstin: { id: 'gstin', label: 'GSTIN', validate: (v) => (GSTIN_RE.test(v.trim().toUpperCase()) ? null : 'Invalid GSTIN format') },
    iec: { id: 'iec', label: 'IEC', validate: (v) => (IEC_RE.test(v.trim().toUpperCase()) ? null : 'IEC must be 10 characters') },
    pan: { id: 'pan', label: 'PAN', validate: (v) => (PAN_RE.test(v.trim().toUpperCase()) ? null : 'Invalid PAN format') },
  },
  documentTypes: ['proforma_invoice', 'commercial_invoice', 'packing_list', 'certificate_of_origin'],
};
