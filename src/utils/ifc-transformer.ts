import {
  type IfcDataStore,
  extractAllEntityAttributes,
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
} from '@ifc-lite/parser';

import { components } from '../types/api';

type LexiconExecutionProfile = components['schemas']['LexiconExecutionProfile'];

export interface TransformedEntity {
  id: string;
  type: string;
  globalId: string;
  name?: string;
  attributes: Record<string, any>;
  parentId?: string;
  path?: string;
}

export interface TransformedProperty {
  entity_id: string;
  property_set_name: string;
  property_name: string;
  value: string;
  value_type: string;
}

export interface TransformedQuantity {
  entity_id: string;
  quantity_set_name: string;
  quantity_name: string;
  value: string;
  value_type: string;
}

export interface TransformedPayload {
  entities: TransformedEntity[];
  properties: TransformedProperty[];
  quantities: TransformedQuantity[];
}

export function transformIfcData(
  rawEntities: any[],
  rawProperties: any[],
  rawQuantities: any[],
  profile?: LexiconExecutionProfile,
): TransformedPayload {
  const targetClasses =
    profile?.target_classes?.map((c) => (c.includes('#') ? c.split('#')[1] : c).toLowerCase()) ||
    [];
  const propertyPaths =
    profile?.property_paths?.map((p) => (p.includes('#') ? p.split('#')[1] : p).toLowerCase()) ||
    [];

  const filteredRawEntities = rawEntities.filter((entity) => {
    if (targetClasses.length === 0) return true;
    return targetClasses.includes(entity.type.toLowerCase());
  });

  const survivingIds = new Set(filteredRawEntities.map((e) => e.expressID));

  const entities = filteredRawEntities.map((entity) => {
    let parentId = entity.parentId?.toString();

    if (entity.path && targetClasses.length > 0) {
      const pathIds = entity.path.split('/');
      let effectiveParentId = undefined;
      for (let i = pathIds.length - 2; i >= 0; i--) {
        const ancestorId = Number(pathIds[i]);
        if (survivingIds.has(ancestorId)) {
          effectiveParentId = ancestorId.toString();
          break;
        }
      }
      parentId = effectiveParentId;
    }

    return {
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
      parentId,
      path: entity.path,
    };
  });
  const entityIds = entities.map((entity) => entity.id);

  const properties: TransformedProperty[] = [];
  rawProperties.forEach((pset) => {
    pset.properties.forEach((prop: any) => {
      if (propertyPaths.length > 0 && !propertyPaths.includes(prop.name.toLowerCase())) {
        return;
      }
      if (!entityIds.includes(pset.entityId.toString())) {
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

  const quantities: TransformedQuantity[] = [];
  rawQuantities.forEach((qset) => {
    (qset.quantities || []).forEach((quant: any) => {
      if (!entityIds.includes(qset.entityId.toString())) {
        return;
      }
      quantities.push({
        entity_id: qset.entityId.toString(),
        quantity_set_name: qset.name,
        quantity_name: quant.name,
        value: quant.value?.toString() || '',
        value_type: quant.type,
      });
    });
  });

  return {
    entities,
    properties,
    quantities,
  };
}

export function extractAndTransform(
  store: IfcDataStore,
  profile?: LexiconExecutionProfile,
): TransformedPayload {
  const entityIds = Array.from(store.entityIndex.byId.keys());

  // Build parentId map from spatial hierarchy
  const parentIdMap = new Map<number, number>();
  if (store.spatialHierarchy) {
    const traverse = (node: any, parentId?: number) => {
      if (parentId !== undefined) {
        parentIdMap.set(node.expressId, parentId);
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child, node.expressId);
        }
      }
      if (node.elements) {
        for (const elementId of node.elements) {
          parentIdMap.set(elementId, node.expressId);
        }
      }
    };
    traverse(store.spatialHierarchy.project);
  }

  // Build pathMap using parentIdMap
  const pathMap = new Map<number, string>();
  const getPath = (id: number): string => {
    if (pathMap.has(id)) return pathMap.get(id)!;
    const parentId = parentIdMap.get(id);
    const path = parentId !== undefined ? `${getPath(parentId)}/${id}` : `${id}`;
    pathMap.set(id, path);
    return path;
  };

  for (const id of entityIds) {
    getPath(id);
  }

  const rawEntities = entityIds
    .map((id) => {
      const attrs = extractAllEntityAttributes(store, id);
      const rootAttrs = extractEntityAttributesOnDemand(store, id);
      const type = store.entityIndex.byId.get(id)?.type || 'UNKNOWN';

      if (!rootAttrs.name && !rootAttrs.objectType) {
        return undefined;
      }
      return {
        expressID: id,
        type,
        GlobalId: { value: rootAttrs.globalId || '' },
        Name: { value: rootAttrs.name },
        attributes: attrs.reduce((acc, curr) => {
          acc[curr.name] = { value: curr.value };
          return acc;
        }, {} as any),
        parentId: parentIdMap.get(id),
        path: pathMap.get(id),
      };
    })
    .filter((_entity) => _entity);

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

  const rawQuantities = entityIds
    .map((id) => {
      const qsets = extractQuantitiesOnDemand(store, id);
      if (qsets.length === 0) return null;
      return qsets.map((qset) => ({
        entityId: id,
        name: qset.name,
        quantities: qset.quantities.map((p) => ({
          name: p.name,
          value: p.value,
          type: p.type.toString(),
        })),
      }));
    })
    .filter((p): p is any[] => p !== null)
    .flat();

  return transformIfcData(rawEntities, rawProperties, rawQuantities, profile);
}
