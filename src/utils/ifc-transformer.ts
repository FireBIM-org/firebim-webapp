import {
  type IfcDataStore,
  extractAllEntityAttributes,
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractRelationshipsOnDemand,
} from '@ifc-lite/parser';

import { components } from '../types/api';

type LexiconExecutionProfile = components['schemas']['LexiconExecutionProfile'];

export interface TransformedEntity {
  id: string;
  type: string;
  globalId: string;
  name?: string;
  attributes: Record<string, any>;
}

export interface TransformedProperty {
  entity_id: string;
  property_set_name: string;
  property_name: string;
  value: string;
  value_type: string;
}

export interface TransformedRelationship {
  type: string;
  relating_id: string;
  related_id: string;
}

export interface TransformedPayload {
  entities: TransformedEntity[];
  properties: TransformedProperty[];
  relationships: TransformedRelationship[];
}

export function transformIfcData(
  rawEntities: any[],
  rawProperties: any[],
  rawRelationships: any[],
  profile?: LexiconExecutionProfile,
): TransformedPayload {
  const targetClasses = profile?.target_classes?.map((c) => c.toLowerCase()) || [];
  const propertyPaths = profile?.property_paths || [];
  const relationPaths = profile?.relation_paths || [];

  const entities = rawEntities
    .filter((entity) => {
      if (targetClasses.length === 0) return true;
      return targetClasses.includes(entity.type.toLowerCase());
    })
    .map((entity) => ({
      id: entity.expressID.toString(),
      type: entity.type,
      globalId: entity.GlobalId?.value || '',
      name: entity.Name?.value,
      attributes: Object.entries(entity.attributes || {}).reduce(
        (acc: any, [key, val]: [string, any]) => {
          acc[key] = val?.value !== undefined ? val.value : val;
          return acc;
        },
        {},
      ),
    }));

  const properties: TransformedProperty[] = [];
  rawProperties.forEach((pset) => {
    pset.properties.forEach((prop: any) => {
      if (propertyPaths.length > 0 && !propertyPaths.includes(prop.name)) {
        return;
      }
      properties.push({
        entity_id: pset.entityId.toString(),
        property_set_name: pset.psetName,
        property_name: prop.name,
        value: prop.value?.toString() || '',
        value_type: prop.type,
      });
    });
  });

  const relationships: TransformedRelationship[] = [];
  rawRelationships.forEach((rel) => {
    if (relationPaths.length > 0 && !relationPaths.includes(rel.type)) {
      return;
    }
    rel.relatedIds.forEach((relatedId: number) => {
      relationships.push({
        type: rel.type,
        relating_id: rel.relatingId.toString(),
        related_id: relatedId.toString(),
      });
    });
  });

  return {
    entities,
    properties,
    relationships,
  };
}

export function extractAndTransform(
  store: IfcDataStore,
  profile?: LexiconExecutionProfile,
): TransformedPayload {
  const entityIds = Array.from(store.entityIndex.byId.keys());

  const rawEntities = entityIds.map((id) => {
    const attrs = extractAllEntityAttributes(store, id);
    const rootAttrs = extractEntityAttributesOnDemand(store, id);
    const type = store.entityIndex.byId.get(id)?.type || 'UNKNOWN';

    return {
      expressID: id,
      type,
      GlobalId: { value: rootAttrs.globalId || '' },
      Name: { value: rootAttrs.name },
      attributes: attrs.reduce((acc, curr) => {
        acc[curr.name] = { value: curr.value };
        return acc;
      }, {} as any),
    };
  });

  const rawProperties = entityIds
    .map((id) => {
      const psets = extractPropertiesOnDemand(store, id);
      if (psets.length === 0) return null;
      return psets.map((pset) => ({
        entityId: id,
        psetName: pset.name,
        properties: pset.properties.map((p) => ({
          name: p.name,
          value: p.value,
          type: p.type.toString(),
        })),
      }));
    })
    .filter((p): p is any[] => p !== null)
    .flat();

  const rawRelationships = entityIds
    .map((id) => {
      const rels = extractRelationshipsOnDemand(store, id);
      const results = [];
      if (rels.voids.length > 0)
        results.push({
          type: 'VoidsElement',
          relatingId: id,
          relatedIds: rels.voids.map((v) => v.id),
        });
      if (rels.fills.length > 0)
        results.push({
          type: 'FillsElement',
          relatingId: id,
          relatedIds: rels.fills.map((f) => f.id),
        });
      if (rels.groups.length > 0)
        results.push({
          type: 'AssignsToGroup',
          relatingId: id,
          relatedIds: rels.groups.map((g) => g.id),
        });
      if (rels.connections.length > 0)
        results.push({
          type: 'ConnectsPathElements',
          relatingId: id,
          relatedIds: rels.connections.map((c) => c.id),
        });
      return results;
    })
    .flat();

  return transformIfcData(rawEntities, rawProperties, rawRelationships, profile);
}
