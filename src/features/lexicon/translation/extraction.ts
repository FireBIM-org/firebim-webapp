import type { TranslationDraftMapping, TranslationMappingExtractionReport } from './types';

import { parseDraftMappings } from './draft';

export type TranslationExtractionResult = {
  report: TranslationMappingExtractionReport;
  added: number;
  skippedDuplicates: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

export function appendExtractedMappings(text: string, suggestions: TranslationDraftMapping[]) {
  const parsed = parseDraftMappings(text);
  const existing = JSON.parse(text) as TranslationDraftMapping[];
  const byId = new Map(parsed.map((mapping, index) => [mapping.id, existing[index]]));
  const additions: TranslationDraftMapping[] = [];
  let skippedDuplicates = 0;
  for (const suggestion of suggestions) {
    const [mapping] = parseDraftMappings(JSON.stringify([suggestion]));
    if (
      !(suggestion.enabled === true && suggestion.review_state === 'accepted') &&
      !(
        suggestion.enabled === false &&
        ['suggestion', 'unresolved'].includes(suggestion.review_state)
      )
    ) {
      throw new Error(
        'Extraction must return enabled and accepted mappings or disabled suggestions.',
      );
    }
    const previous = byId.get(mapping.id);
    if (previous) {
      if (canonical(previous) !== canonical(suggestion)) {
        throw new Error(
          `Extraction returned a conflicting duplicate mapping ID: ${mapping.id}. No suggestions were loaded.`,
        );
      }
      skippedDuplicates += 1;
      continue;
    }
    byId.set(mapping.id, suggestion);
    additions.push(suggestion);
  }
  return {
    mappingsText: additions.length ? JSON.stringify([...existing, ...additions], null, 2) : text,
    added: additions.length,
    skippedDuplicates,
  };
}
