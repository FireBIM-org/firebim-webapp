import * as parser from '@ifc-lite/parser';
import { describe, it, expect, vi } from 'vitest';

import { transformIfcData, extractAndTransform } from './ifc-transformer';

// Mock the parser functions
vi.mock('@ifc-lite/parser', () => ({
  extractAllEntityAttributes: vi.fn(),
  extractEntityAttributesOnDemand: vi.fn(),
  extractPropertiesOnDemand: vi.fn(),
  extractRelationshipsOnDemand: vi.fn(),
}));

describe('ifc-transformer', () => {
  it('should transform a simple IFC entity', () => {
    const entities = [
      {
        expressID: 1,
        type: 'IFCWALLSTANDARDCASE',
        GlobalId: { value: '12345' },
        Name: { value: 'Basic Wall' },
        attributes: {
          Description: { value: 'A simple wall' },
        },
      },
    ];

    const result = transformIfcData(entities, [], []);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toEqual({
      id: '1',
      type: 'IFCWALLSTANDARDCASE',
      globalId: '12345',
      name: 'Basic Wall',
      attributes: {
        Description: 'A simple wall',
      },
    });
  });

  it('should transform properties', () => {
    const entities = [{ expressID: 1, type: 'IFCWALL', GlobalId: { value: 'G1' }, attributes: {} }];
    const properties = [
      {
        entityId: 1,
        psetName: 'Pset_WallCommon',
        properties: [
          { name: 'IsExternal', value: true, type: 'boolean' },
          { name: 'LoadBearing', value: false, type: 'boolean' },
        ],
      },
    ];

    const result = transformIfcData(entities, properties, []);

    expect(result.properties).toHaveLength(2);
    expect(result.properties[0]).toEqual({
      entity_id: '1',
      property_set_name: 'Pset_WallCommon',
      property_name: 'IsExternal',
      value: 'true',
      value_type: 'boolean',
    });
  });

  it('should transform relationships', () => {
    const entities = [
      { expressID: 1, type: 'IFCWALL', GlobalId: { value: 'G1' }, attributes: {} },
      { expressID: 2, type: 'IFCSLAB', GlobalId: { value: 'G2' }, attributes: {} },
    ];
    const relationships = [
      {
        type: 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
        relatingId: 10,
        relatedIds: [1, 2],
      },
    ];

    const result = transformIfcData(entities, [], relationships);

    expect(result.relationships).toHaveLength(2);
    expect(result.relationships[0]).toEqual({
      type: 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
      relating_id: '10',
      related_id: '1',
    });
    expect(result.relationships[1]).toEqual({
      type: 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
      relating_id: '10',
      related_id: '2',
    });
  });

  it('should handle missing attributes and values', () => {
    const entities = [
      {
        expressID: 1,
        type: 'IFCPROJECT',
        // Missing GlobalId, Name, attributes
      },
    ];

    const result = transformIfcData(entities, [], []);

    expect(result.entities[0]).toEqual({
      id: '1',
      type: 'IFCPROJECT',
      globalId: '',
      name: undefined,
      attributes: {},
    });
  });

  it('should extract and transform from a store', () => {
    const mockStore: any = {
      entityIndex: {
        byId: new Map([[1, { expressID: 1, type: 'IFCWALL' }]]),
      },
    };

    vi.mocked(parser.extractAllEntityAttributes).mockReturnValue([
      { name: 'Description', value: 'A wall' },
    ]);
    vi.mocked(parser.extractEntityAttributesOnDemand).mockReturnValue({
      globalId: 'G1',
      name: 'Wall 1',
      description: 'A wall',
      objectType: '',
      tag: '',
    });
    vi.mocked(parser.extractPropertiesOnDemand).mockReturnValue([
      {
        name: 'Pset_WallCommon',
        properties: [{ name: 'IsExternal', value: true, type: 4 }],
      },
    ]);
    vi.mocked(parser.extractRelationshipsOnDemand).mockReturnValue({
      voids: [],
      fills: [],
      groups: [],
      connections: [],
    });

    const result = extractAndTransform(mockStore);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe('1');
    expect(result.entities[0].globalId).toBe('G1');
    expect(result.properties).toHaveLength(1);
    expect(result.properties[0].property_set_name).toBe('Pset_WallCommon');
  });
});
