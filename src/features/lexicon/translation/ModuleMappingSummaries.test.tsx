// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ModuleMappingSummaries from './ModuleMappingSummaries';

describe('module mapping summaries', () => {
  afterEach(cleanup);

  it.each(['class', 'datatype_property', 'object_property', null])(
    'displays the actual target kind %s and current review state from saved JSON',
    (kind) => {
      render(
        <ModuleMappingSummaries
          onReview={() => {}}
          value={JSON.stringify([
            {
              id: 'saved-module',
              enabled: false,
              review_state: 'unresolved',
              definition: {
                language: 'fbo-module-suggestion/1',
                target: { iri: 'https://example.test/target', kind, ranges: [] },
                review_issues: ['Keep the raw value REI60.'],
              },
            },
          ])}
        />,
      );
      const summary = screen.getByRole('region', { name: 'Module mapping summaries' });
      expect(summary.textContent).toContain('https://example.test/target');
      expect(summary.textContent).toContain(kind ?? 'Unknown (unresolved)');
      expect(summary.textContent).toContain('Review state: unresolved');
      expect(summary.textContent).toContain('Disabled');
      expect(summary.textContent).toContain('Keep the raw value REI60.');
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );

  it.each(['[broken', '{}', '[]', '[{"id":"opaque","definition":{"target":[1],"custom":true}}]'])(
    'does not assume opaque or incomplete definitions have a suggestion shape: %s',
    (value) => {
      render(<ModuleMappingSummaries value={value} onReview={() => {}} />);
      expect(screen.queryByRole('region')).toBeNull();
    },
  );

  it('guards malformed suggestion fields rather than rendering objects or inferring a class', () => {
    render(
      <ModuleMappingSummaries
        onReview={() => {}}
        value={JSON.stringify([
          {
            id: 'partial',
            enabled: false,
            review_state: 'unresolved',
            seed_provenance: { kind: 'ontology_module', module: [1], declaration_iri: {} },
            definition: {
              language: 'fbo-module-suggestion/1',
              target: { iri: {}, kind: 'unexpected' },
              review_issues: [{ nested: true }, null, 'Readable issue'],
            },
          },
        ])}
      />,
    );
    const summary = screen.getByRole('region', { name: 'Module mapping summaries' });
    expect(summary.textContent).toContain('Unknown (unresolved)');
    expect(summary.textContent).toContain('Not specified');
    expect(summary.textContent).toContain('Readable issue');
    expect(summary.textContent).not.toContain('[object Object]');
  });
});
