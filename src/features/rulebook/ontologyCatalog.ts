import type {
  BuildingGraphData,
  BuildingGraphPropertyDefinition,
  BuildingGraphTargetClass,
} from './types';

const FBO = 'http://example.org/fbo/1.0/';

export const DEFAULT_ONTOLOGY_CATALOG: Record<
  BuildingGraphTargetClass,
  BuildingGraphPropertyDefinition[]
> = {
  Project: [
    {
      property_path: `${FBO}projectFireStrategy`,
      property_type: 'string',
      label: 'Project fire strategy',
    },
    {
      property_path: `${FBO}projectRiskClass`,
      property_type: 'integer',
      label: 'Project risk class',
    },
  ],
  Site: [
    {
      property_path: `${FBO}siteArea`,
      property_type: 'number',
      label: 'Site area',
    },
    {
      property_path: `${FBO}siteAccessForFireService`,
      property_type: 'boolean',
      label: 'Site access for fire service',
    },
    {
      property_path: `${FBO}sitePermission`,
      property_type: 'boolean',
      label: 'Site permission',
    },
  ],
  Building: [
    {
      property_path: `${FBO}buildingHeight`,
      property_type: 'number',
      label: 'Building height',
    },
    {
      property_path: `${FBO}buildingOccupantLoad`,
      property_type: 'integer',
      label: 'Building occupant load',
    },
    {
      property_path: `${FBO}buildingTypeResidential`,
      property_type: 'boolean',
      label: 'Building type residential',
    },
  ],
  Storey: [
    {
      property_path: `${FBO}storeyElevation`,
      property_type: 'number',
      label: 'Storey elevation',
    },
    {
      property_path: `${FBO}storeyOccupantLoad`,
      property_type: 'integer',
      label: 'Storey occupant load',
    },
  ],
  Wall: [
    {
      property_path: `${FBO}wallFireResistanceMinutes`,
      property_type: 'integer',
      label: 'Wall fire resistance minutes',
    },
    {
      property_path: `${FBO}wallFireratingCategory`,
      property_type: 'string',
      label: 'Wall fire rating category',
    },
  ],
  Column: [
    {
      property_path: `${FBO}columnFireResistanceMinutes`,
      property_type: 'integer',
      label: 'Column fire resistance minutes',
    },
    {
      property_path: `${FBO}columnMaterialCombustibility`,
      property_type: 'string',
      label: 'Column material combustibility',
    },
  ],
  Beam: [
    {
      property_path: `${FBO}beamFireResistanceMinutes`,
      property_type: 'integer',
      label: 'Beam fire resistance minutes',
    },
    {
      property_path: `${FBO}beamMaterialCombustibility`,
      property_type: 'string',
      label: 'Beam material combustibility',
    },
  ],
  Floor: [
    {
      property_path: `${FBO}floorFireResistanceMinutes`,
      property_type: 'integer',
      label: 'Floor fire resistance minutes',
    },
    {
      property_path: `${FBO}floorSurfaceSpreadClass`,
      property_type: 'string',
      label: 'Floor surface spread class',
    },
  ],
  Ceiling: [
    {
      property_path: `${FBO}ceilingFireResistanceMinutes`,
      property_type: 'integer',
      label: 'Ceiling fire resistance minutes',
    },
    {
      property_path: `${FBO}ceilingSurfaceSpreadClass`,
      property_type: 'string',
      label: 'Ceiling surface spread class',
    },
  ],
  Space: [
    {
      property_path: `${FBO}spaceArea`,
      property_type: 'number',
      label: 'Space area',
    },
    {
      property_path: `${FBO}spaceUseCategory`,
      property_type: 'string',
      label: 'Space use category',
    },
  ],
  Room: [
    {
      property_path: `${FBO}roomArea`,
      property_type: 'number',
      label: 'Room area',
    },
    {
      property_path: `${FBO}roomOccupancyType`,
      property_type: 'string',
      label: 'Room occupancy type',
    },
  ],
  'Room-Furniture': [
    {
      property_path: `${FBO}furnitureFireLoadDensity`,
      property_type: 'number',
      label: 'Furniture fire load density',
    },
    {
      property_path: `${FBO}furnitureCombustibilityClass`,
      property_type: 'string',
      label: 'Furniture combustibility class',
    },
  ],
};

export function cloneDefaultOntologyCatalog() {
  return Object.fromEntries(
    Object.entries(DEFAULT_ONTOLOGY_CATALOG).map(([key, value]) => [
      key,
      value.map((item) => ({ ...item })),
    ])
  ) as BuildingGraphData['ontology_catalog'];
}
