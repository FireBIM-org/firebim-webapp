import type {
  BuildingGraphData,
  BuildingGraphNode,
  BuildingGraphPropertyDefinition,
  BuildingGraphTargetClass,
} from './types';

const EX = 'http://example.org/firebim/';
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

function createNode(
  id: string,
  kind: BuildingGraphTargetClass,
  label: string,
  parent_id?: string | null,
  metadata?: Record<string, unknown>
): BuildingGraphNode {
  return {
    id,
    kind,
    label,
    parent_id: parent_id ?? null,
    metadata: metadata ?? {},
  };
}

function buildBuildingRoomGraph(input: {
  id: string;
  label: string;
  buildingId: string;
  buildingHeight: number;
  buildingTypeResidential: boolean;
  sitePermission: boolean;
  roomAreas: number[];
}): BuildingGraphData {
  const building_node_id = input.buildingId;
  const nodes: BuildingGraphNode[] = [
    createNode(building_node_id, 'Building', input.label, null, {
      [`${FBO}buildingHeight`]: input.buildingHeight,
      [`${FBO}buildingTypeResidential`]: input.buildingTypeResidential,
      [`${FBO}sitePermission`]: input.sitePermission,
      [`${FBO}buildingOccupantLoad`]: input.roomAreas.length * 4,
      [`${EX}hasRoom`]: input.roomAreas.map((_, index) => `R${index + 1}`),
    }),
  ];

  const edges: BuildingGraphData['edges'] = [];

  input.roomAreas.forEach((room_area, index) => {
    const room_id = `R${index + 1}`;
    nodes.push(
      createNode(room_id, 'Room', `Room ${index + 1}`, building_node_id, {
        [`${FBO}roomArea`]: room_area,
        [`${FBO}roomOccupancyType`]: room_area > 100 ? 'Assembly' : 'Residential',
      })
    );

    edges.push({
      id: `${building_node_id}-hasRoom-${room_id}`,
      source: building_node_id,
      target: room_id,
      relation: 'hasRoom',
    });
  });

  return {
    id: input.id,
    label: input.label,
    graph_uri: `https://firebim.org/graphs/buildings/${input.id}`,
    source: 'mock',
    ttl: null,
    triple_count: null,
    nodes,
    edges,
    ontology_catalog: cloneDefaultOntologyCatalog(),
  };
}

function buildSimpleGraph(): BuildingGraphData {
  return buildBuildingRoomGraph({
    id: 'simple',
    label: 'Simple test graph',
    buildingId: 'Building_1',
    buildingHeight: 12,
    buildingTypeResidential: true,
    sitePermission: true,
    roomAreas: [18, 32, 44, 65],
  });
}

function buildMediumGraph(): BuildingGraphData {
  return buildBuildingRoomGraph({
    id: 'medium',
    label: 'Medium test graph',
    buildingId: 'Building_2',
    buildingHeight: 22,
    buildingTypeResidential: true,
    sitePermission: true,
    roomAreas: [15, 22, 30, 44, 60, 75, 90, 110],
  });
}

function buildXlGraph(): BuildingGraphData {
  return buildBuildingRoomGraph({
    id: 'xl',
    label: 'XL test graph',
    buildingId: 'Building_3',
    buildingHeight: 35,
    buildingTypeResidential: true,
    sitePermission: true,
    roomAreas: [
      30, 60, 90, 110, 140, 180, 220, 300, 15, 75, 45, 55, 85, 95, 125, 160,
      205, 260,
    ],
  });
}

export const MOCK_BUILDING_GRAPHS: BuildingGraphData[] = [
  buildSimpleGraph(),
  buildMediumGraph(),
  buildXlGraph(),
];

export function getMockGraphById(id: string): BuildingGraphData | null {
  const graph = MOCK_BUILDING_GRAPHS.find((item) => item.id === id);
  return graph
    ? {
        ...graph,
        nodes: graph.nodes.map((node) => ({
          ...node,
          metadata: { ...(node.metadata ?? {}) },
        })),
        edges: graph.edges.map((edge) => ({ ...edge })),
        ontology_catalog: cloneDefaultOntologyCatalog(),
      }
    : null;
}