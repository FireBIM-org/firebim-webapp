import { describe, expect, it } from 'vitest';

import type { TranslationDraftMapping } from './types';

import { appendExtractedMappings } from './extraction';

const suggestion: TranslationDraftMapping = {
  id: 'module-wall',
  enabled: true,
  review_state: 'accepted',
  definition: { language: 'fbo-module-suggestion/1', source: { raw_value: 'REI60' } },
};

describe('appendExtractedMappings', () => {
  it('preserves existing JSON values and review states while appending suggestions', () => {
    const existing = [
      {
        id: 'manual',
        enabled: true,
        review_state: 'accepted',
        definition: { raw_value: 'REI60', custom: [null, false] },
      },
      { id: 'rejected', enabled: false, review_state: 'rejected', definition: {} },
      { id: 'incomplete' },
    ];
    const result = appendExtractedMappings(JSON.stringify(existing), [suggestion]);
    expect(JSON.parse(result.mappingsText)).toEqual([...existing, suggestion]);
    expect(result.added).toBe(1);
  });

  it('deduplicates identical returned IDs and is idempotent across repeated previews', () => {
    const first = appendExtractedMappings('[]', [suggestion, { ...suggestion }]);
    expect(first.added).toBe(1);
    expect(first.skippedDuplicates).toBe(1);
    const second = appendExtractedMappings(first.mappingsText, [
      {
        definition: { source: { raw_value: 'REI60' }, language: 'fbo-module-suggestion/1' },
        review_state: 'accepted',
        enabled: true,
        id: suggestion.id,
      },
    ]);
    expect(second).toEqual({ mappingsText: first.mappingsText, added: 0, skippedDuplicates: 1 });
  });

  it.each(['existing', 'returned'])('rejects conflicting %s IDs atomically', (collision) => {
    const conflict = { ...suggestion, definition: { raw_value: 'different' } };
    const existing = collision === 'existing' ? JSON.stringify([conflict]) : '[]';
    const incoming = collision === 'existing' ? [suggestion] : [suggestion, conflict];
    expect(() => appendExtractedMappings(existing, incoming)).toThrow(
      /conflicting duplicate mapping ID/,
    );
    expect(suggestion.definition.source).toEqual({ raw_value: 'REI60' });
  });

  it.each([
    { review_state: 'unresolved' as const },
    { review_state: 'suggestion' as const },
    { review_state: 'rejected' as const },
  ])('rejects unsafe generated mapping envelopes: %j', (overrides) => {
    expect(() => appendExtractedMappings('[]', [{ ...suggestion, ...overrides }])).toThrow(
      /enabled and accepted mappings or disabled suggestions/,
    );
  });

  it('accepts disabled suggestions from older servers without changing their state', () => {
    const legacy = { ...suggestion, enabled: false, review_state: 'unresolved' as const };
    expect(JSON.parse(appendExtractedMappings('[]', [legacy]).mappingsText)).toEqual([legacy]);
  });

  it.each(['[broken', '{}', '[{"id":"same"},{"id":"same"}]'])(
    'leaves invalid existing input untouched: %s',
    (text) => {
      expect(() => appendExtractedMappings(text, [suggestion])).toThrow();
    },
  );

  it('leaves formatting untouched when there are no new suggestions', () => {
    const text = ' [ ]\n';
    expect(appendExtractedMappings(text, [])).toEqual({
      mappingsText: text,
      added: 0,
      skippedDuplicates: 0,
    });
  });
});
