import type { RuleDefinition, RuleListItem } from './types';

export type SeededExampleRule = {
  rule_id: string;
  label: string;
  graph_uri: string;
  description: string;
  rule_definition: RuleDefinition;
  shacl_ttl: string;
};

const FBO = 'http://example.org/fbo/1.0/';

function createEndNode(node_id: string, label: string, terminal_value: string) {
  return {
    id: node_id,
    element_type: 'end' as const,
    target_class: null,
    property_path: null,
    operator: null,
    value: terminal_value,
    true_path: null,
    false_path: null,
    unknown_path: null,
    label,
    config: {
      terminal_value,
      end_kind: terminal_value,
      output_text: terminal_value,
    },
    graph_uri: null,
  };
}

function createSeededRuleTtl(rule_id: string, target_classes: string[], property_paths: string[]) {
  const classes = target_classes.map((value) => `<${value}>`).join(', ');
  const properties = property_paths.map((value) => `<${value}>`).join(', ');

  return `PREFIX fbo: <${FBO}>\nPREFIX ex: <http://example.org/firebim/>\nPREFIX sh: <http://www.w3.org/ns/shacl#>\n\n# Seeded example for ${rule_id}\n# target_classes: ${classes}\n# property_paths: ${properties}\n`;
}

export const SEEDED_EXAMPLE_RULES: SeededExampleRule[] = [
  {
    rule_id: 'it-rule-complex-large-current-graph-2911550a',
    label: 'Example rule - Bulding-Storey-Zone-Room-Wall',
    graph_uri:
      'https://firebim.org/graphs/rulebook/it-rule-complex-large-current-graph-2911550a',
    description:
      'Example copy of the complex Building height rule spanning Building, Storey, Zone, Room, and Wall checks.',
    shacl_ttl: createSeededRuleTtl(
      'it-rule-complex-large-current-graph-2911550a',
      [
        `${FBO}Building`,
        `${FBO}Storey`,
        `${FBO}Zone`,
        `${FBO}Room`,
        `${FBO}Wall`,
      ],
      [
        `${FBO}BuildingHeight`,
        `${FBO}StoreyNumber`,
        `${FBO}FireCompartmentId`,
        `${FBO}NumberOfOccupants`,
        `${FBO}FireRating`,
        `${FBO}OccupancyType`,
        `${FBO}LoadBearing`,
      ]
    ),
    rule_definition: {
      id: 'it-rule-complex-large-current-graph-2911550a',
      entry: 'it-rule-complex-large-current-graph-2911550a-d01',
      rule_elements: [
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d01',
          element_type: 'decision',
          target_class: `${FBO}Building`,
          property_path: `${FBO}BuildingHeight`,
          operator: '>',
          value: 0,
          true_path: 'it-rule-complex-large-current-graph-2911550a-d02',
          false_path: 'it-rule-complex-large-current-graph-2911550a-d02',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-d02',
          label: 'Building height',
          config: {},
          graph_uri: null,
        },
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d02',
          element_type: 'decision',
          target_class: `${FBO}Storey`,
          property_path: `${FBO}StoreyNumber`,
          operator: '>=',
          value: 1,
          true_path: 'it-rule-complex-large-current-graph-2911550a-d03',
          false_path: 'it-rule-complex-large-current-graph-2911550a-d03',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-d03',
          label: 'Storey number',
          config: {},
          graph_uri: null,
        },
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d03',
          element_type: 'decision',
          target_class: `${FBO}Zone`,
          property_path: `${FBO}FireCompartmentId`,
          operator: '==',
          value: 'FC-1',
          true_path: 'it-rule-complex-large-current-graph-2911550a-d04',
          false_path: 'it-rule-complex-large-current-graph-2911550a-d04',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-d04',
          label: 'Fire compartment id',
          config: {},
          graph_uri: null,
        },
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d04',
          element_type: 'decision',
          target_class: `${FBO}Room`,
          property_path: `${FBO}NumberOfOccupants`,
          operator: '>=',
          value: 1,
          true_path: 'it-rule-complex-large-current-graph-2911550a-d05',
          false_path: 'it-rule-complex-large-current-graph-2911550a-d05',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-d05',
          label: 'Number of occupants',
          config: {},
          graph_uri: null,
        },
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d05',
          element_type: 'decision',
          target_class: `${FBO}Wall`,
          property_path: `${FBO}FireRating`,
          operator: '==',
          value: 'EI60',
          true_path: 'it-rule-complex-large-current-graph-2911550a-d06',
          false_path: 'it-rule-complex-large-current-graph-2911550a-d06',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-d06',
          label: 'Fire rating',
          config: {},
          graph_uri: null,
        },
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d06',
          element_type: 'decision',
          target_class: `${FBO}Room`,
          property_path: `${FBO}OccupancyType`,
          operator: '==',
          value: 'office',
          true_path: 'it-rule-complex-large-current-graph-2911550a-d07',
          false_path: 'it-rule-complex-large-current-graph-2911550a-d07',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-d07',
          label: 'Occupancy type',
          config: {},
          graph_uri: null,
        },
        {
          id: 'it-rule-complex-large-current-graph-2911550a-d07',
          element_type: 'decision',
          target_class: `${FBO}Wall`,
          property_path: `${FBO}LoadBearing`,
          operator: '==',
          value: 'True',
          true_path: 'it-rule-complex-large-current-graph-2911550a-pass',
          false_path: 'it-rule-complex-large-current-graph-2911550a-pass',
          unknown_path: 'it-rule-complex-large-current-graph-2911550a-pass',
          label: 'Load bearing',
          config: {},
          graph_uri: null,
        },
        createEndNode(
          'it-rule-complex-large-current-graph-2911550a-pass',
          'assembled-pass',
          'passed'
        ),
        createEndNode(
          'it-rule-complex-large-current-graph-2911550a-fail',
          'assembled-fail',
          'failed'
        ),
        createEndNode(
          'it-rule-complex-large-current-graph-2911550a-unknown',
          'assembled-unknown',
          'unknown'
        ),
      ],
    },
  },
  {
    rule_id: 'it-rule-mismatch-auto-small',
    label: 'Example rule - Class mismach',
    graph_uri: 'https://firebim.org/graphs/rulebook/it-rule-mismatch-auto-small',
    description:
      'Example copy of the intentional mismatch rule, targeting a class and property that do not exist in the graph.',
    shacl_ttl: createSeededRuleTtl(
      'it-rule-mismatch-auto-small',
      [`${FBO}NonExistingType`],
      [`${FBO}NonExistingProperty`]
    ),
    rule_definition: {
      id: 'it-rule-mismatch-auto-small',
      entry: 'it-rule-mismatch-auto-small-decision',
      rule_elements: [
        {
          id: 'it-rule-mismatch-auto-small-decision',
          element_type: 'decision',
          target_class: `${FBO}NonExistingType`,
          property_path: `${FBO}NonExistingProperty`,
          operator: '==',
          value: 'True',
          true_path: 'it-rule-mismatch-auto-small-pass',
          false_path: 'it-rule-mismatch-auto-small-fail',
          unknown_path: 'it-rule-mismatch-auto-small-unknown',
          label: 'Intentional mismatch rule',
          config: {},
          graph_uri: null,
        },
        createEndNode('it-rule-mismatch-auto-small-pass', 'passed', 'passed'),
        createEndNode('it-rule-mismatch-auto-small-fail', 'failed', 'failed'),
        createEndNode('it-rule-mismatch-auto-small-unknown', 'unknown', 'unknown'),
      ],
    },
  },
  {
    rule_id: 'it-rule-unknown-auto-small',
    label: 'Example rule - Stop on Unknown',
    graph_uri: 'https://firebim.org/graphs/rulebook/it-rule-unknown-auto-small',
    description:
      'Example copy of the unknown property test, intentionally driving execution to the unknown branch.',
    shacl_ttl: createSeededRuleTtl(
      'it-rule-unknown-auto-small',
      [`${FBO}SensorTypeSmokeSensor`],
      [`${FBO}DoesNotExistYet`]
    ),
    rule_definition: {
      id: 'it-rule-unknown-auto-small',
      entry: 'it-rule-unknown-auto-small-decision',
      rule_elements: [
        {
          id: 'it-rule-unknown-auto-small-decision',
          element_type: 'decision',
          target_class: `${FBO}SensorTypeSmokeSensor`,
          property_path: `${FBO}DoesNotExistYet`,
          operator: '==',
          value: 'True',
          true_path: 'it-rule-unknown-auto-small-pass',
          false_path: 'it-rule-unknown-auto-small-fail',
          unknown_path: 'it-rule-unknown-auto-small-unknown',
          label: 'Unknown property test',
          config: {},
          graph_uri: null,
        },
        createEndNode('it-rule-unknown-auto-small-pass', 'passed', 'passed'),
        createEndNode('it-rule-unknown-auto-small-fail', 'failed', 'failed'),
        createEndNode('it-rule-unknown-auto-small-unknown', 'unknown', 'unknown'),
      ],
    },
  },
];

export const SEEDED_EXAMPLE_RULE_IDS = SEEDED_EXAMPLE_RULES.map(
  (item) => item.rule_id
);

export function getSeededExampleRuleListItems(): RuleListItem[] {
  return SEEDED_EXAMPLE_RULES.map((item) => ({
    rule_id: item.rule_id,
    label: item.label,
    graph_uri: item.graph_uri,
    source: 'example',
    entry: item.rule_definition.entry,
    rule_element_count: Array.isArray(item.rule_definition.rule_elements)
      ? item.rule_definition.rule_elements.length
      : 0,
    target_classes: Array.from(
      new Set(
        (Array.isArray(item.rule_definition.rule_elements)
          ? item.rule_definition.rule_elements
          : [])
          .map((element) => element.target_class)
          .filter((value): value is string => Boolean(value))
      )
    ),
    description: item.description,
  }));
}

export function getSeededExampleRuleDefinition(
  rule_id: string
): RuleDefinition | null {
  const match = SEEDED_EXAMPLE_RULES.find((item) => item.rule_id === rule_id);
  return match?.rule_definition ?? null;
}

export function getSeededExampleRuleTtl(rule_id: string): string | null {
  const match = SEEDED_EXAMPLE_RULES.find((item) => item.rule_id === rule_id);
  return match?.shacl_ttl ?? null;
}

export function ensureSeededExampleRules(
  api_rules: RuleListItem[]
): RuleListItem[] {
  const seeded = getSeededExampleRuleListItems();
  const merged = new Map<string, RuleListItem>();
  const seededById = new Map<string, RuleListItem>();

  for (const rule of seeded) {
    seededById.set(rule.rule_id, rule);
    merged.set(rule.rule_id, rule);
  }

  for (const rule of api_rules) {
    const seededRule = seededById.get(rule.rule_id);

    if (seededRule) {
      merged.set(rule.rule_id, {
        ...rule,
        label: seededRule.label,
        description: seededRule.description,
        source: 'example',
      });
      continue;
    }

    merged.set(rule.rule_id, rule);
  }

  return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
}
