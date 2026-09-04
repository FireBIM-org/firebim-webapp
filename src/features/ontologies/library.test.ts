import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listOntologyCatalogTerms } = vi.hoisted(() => ({
  listOntologyCatalogTerms: vi.fn(),
}));

vi.mock('@/utils/api-client', () => ({
  default: { listOntologyCatalogTerms },
}));

import { searchOntologyLibraryTerms } from './library';

describe('searchOntologyLibraryTerms', () => {
  beforeEach(() => {
    listOntologyCatalogTerms.mockReset();
  });

  it('returns class suggestions from each selected ontology', async () => {
    listOntologyCatalogTerms.mockResolvedValue({
      terms: [
        {
          term_id: 'Room',
          uri: 'https://example.test/Room',
          kind: 'class',
          label: 'Room',
          is_predefined_type: false,
        },
        {
          term_id: 'area',
          uri: 'https://example.test/area',
          kind: 'datatype_property',
          label: 'Area',
          is_predefined_type: false,
        },
      ],
    });

    const suggestions = await searchOntologyLibraryTerms(
      ['fbo/dk/latest', 'ifc/global/latest'],
      'target_class',
      'room',
    );

    expect(listOntologyCatalogTerms).toHaveBeenCalledTimes(2);
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((term) => term.term_id === 'Room')).toBe(true);
    expect(suggestions.map((term) => term.ontology_label)).toEqual(['FBO DK', 'IFC']);
  });

  it('keeps property terms and excludes property sets', async () => {
    listOntologyCatalogTerms.mockResolvedValue({
      terms: [
        {
          term_id: 'area',
          uri: 'https://example.test/area',
          kind: 'datatype_property',
          label: 'Area',
          is_predefined_type: false,
        },
        {
          term_id: 'dimensions',
          uri: 'https://example.test/dimensions',
          kind: 'property_set',
          label: 'Dimensions',
          is_predefined_type: false,
        },
      ],
    });

    const suggestions = await searchOntologyLibraryTerms(
      ['rir/global/latest'],
      'property_path',
      '',
    );

    expect(suggestions.map((term) => term.term_id)).toEqual(['area']);
  });
});
