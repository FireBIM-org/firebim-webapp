import apiClient, {
  type LexiconCatalogTerm,
  type OntologySummary,
  type RuleTermValidationRequest,
  type RuleTermValidationResponse,
} from '@/utils/api-client';

export const OFFICIAL_FIREBIM_ONTOLOGY_INDEX =
  'https://firebim.org/documentation/ontologies/index.json';

export type OntologyLibraryEntry = {
  id: string;
  ontology_family: string;
  country: string;
  version: string;
  label: string;
  description: string;
};

export const STANDARD_ONTOLOGY_LIBRARY: OntologyLibraryEntry[] = [
  {
    id: 'fbo/dk/latest',
    ontology_family: 'fbo',
    country: 'dk',
    version: 'latest',
    label: 'FBO DK',
    description: 'Danish FireBIM ontology definitions.',
  },
  {
    id: 'ifc/global/latest',
    ontology_family: 'ifc',
    country: 'global',
    version: 'latest',
    label: 'IFC',
    description: 'IFC classes and properties imported through the ontology registry.',
  },
  {
    id: 'rir/global/latest',
    ontology_family: 'rir',
    country: 'global',
    version: 'latest',
    label: 'RIR',
    description: 'Regulatory Information Requirements classes and properties.',
  },
];

export const RULEBUILDER_ONTOLOGY_STORAGE_KEY = 'firebim-rulebuilder-ontologies-v1';
export const USER_ONTOLOGY_LIBRARY_STORAGE_KEY = 'firebim-user-ontologies-v1';
export const DISCOVERED_ONTOLOGY_LIBRARY_STORAGE_KEY = 'firebim-discovered-ontologies-v1';

function readStoredOntologyLibrary(key: string): OntologyLibraryEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is OntologyLibraryEntry =>
        typeof value?.id === 'string' &&
        typeof value?.ontology_family === 'string' &&
        typeof value?.country === 'string' &&
        typeof value?.version === 'string' &&
        typeof value?.label === 'string' &&
        typeof value?.description === 'string',
    );
  } catch {
    return [];
  }
}

export function readUserOntologyLibrary(): OntologyLibraryEntry[] {
  return readStoredOntologyLibrary(USER_ONTOLOGY_LIBRARY_STORAGE_KEY);
}

export function getOntologyLibrary(): OntologyLibraryEntry[] {
  const entries = [
    ...STANDARD_ONTOLOGY_LIBRARY,
    ...readStoredOntologyLibrary(DISCOVERED_ONTOLOGY_LIBRARY_STORAGE_KEY),
    ...readUserOntologyLibrary(),
  ];
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

export function ontologyLibraryEntriesFromSummaries(
  ontologies: OntologySummary[],
): OntologyLibraryEntry[] {
  return ontologies.map((ontology) => ({
    id: `${ontology.ontology_family}/${ontology.country}/latest`,
    ontology_family: ontology.ontology_family,
    country: ontology.country,
    version: 'latest',
    label: `${ontology.ontology_family.toUpperCase()} ${ontology.country.toUpperCase()}`,
    description: `Published in the backend ontology store; latest release ${ontology.latest_version ?? 'unknown'}.`,
  }));
}

export async function refreshOntologyLibrary(): Promise<OntologyLibraryEntry[]> {
  const response = await apiClient.listOntologies();
  const discovered = ontologyLibraryEntriesFromSummaries(response.ontologies ?? []);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      DISCOVERED_ONTOLOGY_LIBRARY_STORAGE_KEY,
      JSON.stringify(discovered),
    );
  }

  const entries = [...STANDARD_ONTOLOGY_LIBRARY, ...discovered, ...readUserOntologyLibrary()];
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

export function rememberUserOntology(entry: OntologyLibraryEntry) {
  if (typeof window === 'undefined') return;
  const entries = readUserOntologyLibrary().filter((item) => item.id !== entry.id);
  entries.push(entry);
  window.localStorage.setItem(USER_ONTOLOGY_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
}

export function readRuleBuilderOntologySelection(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RULEBUILDER_ONTOLOGY_STORAGE_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    const knownIds = new Set(getOntologyLibrary().map((entry) => entry.id));
    return parsed.filter(
      (value): value is string => typeof value === 'string' && knownIds.has(value),
    );
  } catch {
    return [];
  }
}

export function saveRuleBuilderOntologySelection(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RULEBUILDER_ONTOLOGY_STORAGE_KEY, JSON.stringify(ids));
}

function isRelevantTerm(term: LexiconCatalogTerm, field: 'target_class' | 'property_path') {
  const kind = term.kind.toLowerCase().replace(/[\s_-]+/g, '');
  if (field === 'target_class') return kind.includes('class') && !kind.includes('property');
  return kind.includes('property') && !kind.includes('propertyset');
}

export type OntologyTermSuggestion = LexiconCatalogTerm & {
  ontology_id: string;
  ontology_label: string;
};

export async function searchOntologyLibraryTerms(
  selectedIds: string[],
  field: 'target_class' | 'property_path',
  search: string,
): Promise<OntologyTermSuggestion[]> {
  const selected = getOntologyLibrary().filter((entry) => selectedIds.includes(entry.id));
  if (selected.length === 0) return [];

  const responses = await Promise.allSettled(
    selected.map(async (entry) => {
      const response = await apiClient.listOntologyCatalogTerms(
        entry.ontology_family,
        entry.country,
        entry.version,
        { search: search.trim() || undefined, limit: 40 },
      );
      return (response.terms ?? [])
        .filter((term) => isRelevantTerm(term, field))
        .map((term) => ({
          ...term,
          ontology_id: entry.id,
          ontology_label: entry.label,
        }));
    }),
  );

  const unique = new Map<string, OntologyTermSuggestion>();
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue;
    for (const term of response.value) {
      unique.set(`${term.ontology_id}:${term.uri}`, term);
    }
  }

  return [...unique.values()]
    .sort(
      (left, right) =>
        (left.label ?? left.term_id).localeCompare(right.label ?? right.term_id) ||
        left.ontology_label.localeCompare(right.ontology_label),
    )
    .slice(0, 24);
}

export async function validateRuleTermsAgainstOntologyLibrary(
  selectedIds: string[],
  rule: RuleTermValidationRequest['rule'],
): Promise<RuleTermValidationResponse> {
  const selectedOntologies = getOntologyLibrary()
    .filter((entry) => selectedIds.includes(entry.id))
    .map((entry) => ({
      ontology_family: entry.ontology_family,
      country: entry.country,
      version: entry.version,
    }));

  if (selectedOntologies.length === 0) {
    return {
      valid: true,
      rule_ids: [rule.id],
      issues: [],
      stats: {
        rule_count: 1,
        ontology_count: 0,
        validated_node_count: 0,
        validated_field_count: 0,
        invalid_node_count: 0,
        issue_count: 0,
      },
    };
  }

  return apiClient.validateRuleTerms({
    selected_ontologies: selectedOntologies,
    rule,
  });
}
