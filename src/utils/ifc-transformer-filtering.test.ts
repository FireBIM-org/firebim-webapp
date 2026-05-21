import { describe, it, expect } from 'vitest';

import { transformIfcData } from './ifc-transformer';

describe('ifc-transformer filtering', () => {
  const mockEntities = [
    {
      expressID: 1,
      type: 'IfcWall',
      GlobalId: { value: 'G1' },
      attributes: { Name: { value: 'Wall 1' } },
    },
    {
      expressID: 2,
      type: 'IfcWindow',
      GlobalId: { value: 'G2' },
      attributes: { Name: { value: 'Window 1' } },
    },
    {
      expressID: 3,
      type: 'IfcDoor',
      GlobalId: { value: 'G3' },
      attributes: { Name: { value: 'Door 1' } },
    },
  ];

  const mockProperties = [
    {
      entityId: 1,
      psetName: 'Pset_WallCommon',
      properties: [
        { name: 'IsExternal', value: true, type: 'boolean' },
        { name: 'LoadBearing', value: false, type: 'boolean' },
      ],
    },
    {
      entityId: 2,
      psetName: 'Pset_WindowCommon',
      properties: [{ name: 'IsExternal', value: true, type: 'boolean' }],
    },
  ];

  const mockRelationships = [
    {
      type: 'VoidsElement',
      relatingId: 1,
      relatedIds: [2],
    },
    {
      type: 'FillsElement',
      relatingId: 2,
      relatedIds: [3],
    },
  ];

  it('should filter entities by target_classes (case-insensitive)', () => {
    const profile = {
      target_classes: ['IFCWALL', 'ifcwindow'],
    } as any;

    const result = transformIfcData(mockEntities, [], [], profile);

    expect(result.entities).toHaveLength(2);
    expect(result.entities.map((e) => e.type)).toContain('IfcWall');
    expect(result.entities.map((e) => e.type)).toContain('IfcWindow');
    expect(result.entities.map((e) => e.type)).not.toContain('IfcDoor');
  });

  it('should filter properties by property_paths', () => {
    const profile = {
      property_paths: ['IsExternal'],
    } as any;

    const result = transformIfcData(mockEntities, mockProperties, [], profile);

    expect(result.properties).toHaveLength(2);
    result.properties.forEach((p) => {
      expect(p.property_name).toBe('IsExternal');
      expect(p.property_name).not.toBe('LoadBearing');
    });
  });

  it('should filter relationships by relation_paths', () => {
    const profile = {
      relation_paths: ['VoidsElement'],
    } as any;

    const result = transformIfcData(mockEntities, [], mockRelationships, profile);

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].type).toBe('VoidsElement');
    expect(result.relationships[0].relating_id).toBe('1');
    expect(result.relationships[0].related_id).toBe('2');
  });

  it('should return all data if no profile is provided', () => {
    const result = transformIfcData(mockEntities, mockProperties, mockRelationships);

    expect(result.entities).toHaveLength(3);
    expect(result.properties).toHaveLength(3);
    expect(result.relationships).toHaveLength(2);
  });
});
