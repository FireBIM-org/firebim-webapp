import type { TranslationDraftMapping, TranslationValidationReport } from './types';

export function failingMappings(
  report: TranslationValidationReport,
  mappings: TranslationDraftMapping[],
) {
  if (report.authoring_valid) return [];
  const ids = new Set(
    report.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error' && diagnostic.mapping_id !== null)
      .map((diagnostic) => diagnostic.mapping_id),
  );
  return mappings.filter((mapping) => mapping.enabled && ids.has(mapping.id));
}
