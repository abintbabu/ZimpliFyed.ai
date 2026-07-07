import 'server-only';

// The free, public U.S. Consolidated Screening List — aggregates OFAC SDN/Non-SDN,
// BIS Entity List/Denied Persons List, State Dept debarred list, and others.
// Register a free key at https://developer.trade.gov/ and set CSL_API_KEY.
const CSL_ENDPOINT = 'https://api.trade.gov/consolidated_screening_list/search';

export type CslMatch = {
  name: string;
  source: string;
  sourceListUrl: string | null;
  countries: string[];
};

export type CslLookupResult =
  | { mode: 'api'; matches: CslMatch[] }
  | { mode: 'manual'; reason: string };

/**
 * Screens a name against the U.S. Consolidated Screening List. Falls back to manual mode
 * (no API key configured) rather than ever fabricating a result — a wrong "clear" here has
 * real export-control consequences, so this deliberately does not use an LLM.
 */
export async function screenAgainstConsolidatedList(name: string, country?: string): Promise<CslLookupResult> {
  const apiKey = process.env.CSL_API_KEY;
  if (!apiKey) {
    return { mode: 'manual', reason: 'No CSL_API_KEY configured — record the result of a manual check instead.' };
  }

  const url = new URL(CSL_ENDPOINT);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('name', name);
  if (country) url.searchParams.set('countries', country);
  url.searchParams.set('size', '10');
  url.searchParams.set('fuzzy_name', 'true');

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Consolidated Screening List lookup failed (${res.status})`);
  }

  const body: {
    results?: { name: string; source: string; source_list_url?: string; countries?: string[] }[];
  } = await res.json();

  const matches: CslMatch[] = (body.results ?? []).map((r) => ({
    name: r.name,
    source: r.source,
    sourceListUrl: r.source_list_url ?? null,
    countries: r.countries ?? [],
  }));

  return { mode: 'api', matches };
}
